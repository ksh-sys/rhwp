//! 메모(검토 주석) 편집 — 본문·표 셀·글상자 단일 문단의 범위 필드 `FieldType::Memo`.
//! 삽입·제거는 하이퍼링크와 같은 범위 필드 경로(`insert_range_field_native` 등)를 쓴다.
//! 파일 형상은 한글 2024 실측(`samples/hwpx/aift.hwpx`)을 따른다:
//! `MEMO/65535/<번호>/<메모별 난수>/<문서 공통 난수>/<작성자>/\;;`, 파라미터 7종,
//! `fieldid`(instance_id) 고정값, 본문 subList 문단 1개 이상.

use super::hyperlink::{find_field, FieldTarget};
use super::DocumentCore;
use crate::error::HwpError;
use crate::model::control::{Control, Field, FieldType, Parameter, ParameterList};
use crate::model::event::DocumentEvent;
use crate::model::paragraph::Paragraph;
use crate::parser::tags;

/// 한글이 MEMO 필드의 `fieldid` 에 쓰는 고정값(aift.hwpx·사용자 제공 파일·파서 시험 모두 동일).
pub const MEMO_FIELD_INSTANCE_ID: u32 = 623_209_829;
/// `MemoShapeIDRef` — 한글은 memoPr 이 있어도 65535(없음)를 쓴다.
const MEMO_SHAPE_NONE: &str = "65535";

/// HWPX 메모(`FieldType::Memo`) 또는 .hwp 출처 메모(`Unknown` + command `MEMO/`).
pub fn is_memo_field(f: &Field) -> bool {
    f.field_type == FieldType::Memo
        || (f.field_type == FieldType::Unknown && f.command.starts_with("MEMO/"))
}

/// 메모 본문 텍스트 — 문단들을 `\n` 으로 잇는다. 본문이 없으면(.hwp 출처) 빈 문자열.
pub fn memo_text(f: &Field) -> String {
    f.memo_paragraphs
        .iter()
        .map(|p| p.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// 작성자 — 파라미터 `Author`, 없으면 command 토큰 5.
pub fn memo_author(f: &Field) -> String {
    string_param(f, "Author")
        .map(str::to_string)
        .unwrap_or_else(|| f.command.split('/').nth(5).unwrap_or("").to_string())
}

/// 작성 시각 — 파라미터 `CreateDateTime`(ISO 8601 UTC), 없으면 빈 문자열.
pub fn memo_created_at(f: &Field) -> String {
    string_param(f, "CreateDateTime").unwrap_or("").to_string()
}

fn string_param<'a>(f: &'a Field, name: &str) -> Option<&'a str> {
    f.parameters.items.iter().find_map(|p| match p {
        Parameter::String {
            name: Some(n),
            value,
            ..
        } if n == name => Some(value.as_str()),
        _ => None,
    })
}

impl DocumentCore {
    /// 선택 범위 [start, end) 에 메모를 단다. 반환은 새 field_id.
    pub fn insert_memo_native(
        &mut self,
        target: &FieldTarget,
        start: usize,
        end: usize,
        author: &str,
        text: &str,
        created_at: &str,
    ) -> Result<u32, HwpError> {
        let number = self.next_memo_index();
        let doc_token = self.memo_doc_token();
        let memo_token = random_token(number);
        let command = format!("MEMO/{MEMO_SHAPE_NONE}/{number}/{memo_token}/{doc_token}/{author}/\\;;");
        let parameters = memo_parameters(&command, number, author, Some(created_at));
        self.insert_range_field_native(
            target,
            start,
            end,
            |field_id, anchor| Field {
                field_type: FieldType::Memo,
                command,
                ctrl_id: tags::FIELD_MEMO,
                field_id,
                instance_id: Some(MEMO_FIELD_INSTANCE_ID),
                properties: 1, // editable="1"
                memo_index: number,
                parameters,
                memo_paragraphs: vec![memo_body_paragraph(anchor, text)],
                ..Default::default()
            },
            memo_event,
        )
    }

    /// 메모 본문을 한 문단 텍스트로 바꾼다. 같은 텍스트면 `Ok(false)`.
    /// .hwp 출처(Unknown) 메모는 HWPX 메모로 승격해 파라미터를 채운다 — 그래야 저장 시 본문이 남는다.
    pub fn set_memo_text_native(
        &mut self,
        target: &FieldTarget,
        field_id: u32,
        text: &str,
    ) -> Result<bool, HwpError> {
        self.validate_hyperlink_paragraph(target)?;
        let mut candidate = self.hyperlink_paragraph(target)?.clone();
        let (_, ctrl_idx) = find_field(&candidate, field_id, is_memo_field)?;
        let template = candidate.clone();
        let Control::Field(field) = &mut candidate.controls[ctrl_idx] else {
            unreachable!()
        };
        if !field.memo_paragraphs.is_empty() && memo_text(field) == text {
            return Ok(false);
        }
        let base = field.memo_paragraphs.first().unwrap_or(&template);
        let body = memo_body_paragraph(base, text);
        field.memo_paragraphs = vec![body];
        if field.field_type != FieldType::Memo {
            field.field_type = FieldType::Memo;
            field.ctrl_id = tags::FIELD_MEMO;
        }
        if field.parameters.is_empty() {
            let author = memo_author(field);
            field.parameters = memo_parameters(&field.command, field.memo_index, &author, None);
        }
        field.raw_parameters_xml = None;
        self.commit_field_paragraph(target, candidate, memo_event(target, field_id))?;
        Ok(true)
    }

    /// 메모를 지운다. 대상 글자는 남는다.
    pub fn remove_memo_native(&mut self, target: &FieldTarget, field_id: u32) -> Result<(), HwpError> {
        self.remove_range_field_keep_text_native(target, field_id, is_memo_field, memo_event)
    }

    /// 문서 전체 메모 번호 최댓값 + 1 (본문·표 셀·글상자 순회 기준).
    fn next_memo_index(&self) -> u32 {
        self.collect_all_fields()
            .iter()
            .filter(|fi| is_memo_field(&fi.field))
            .map(|fi| fi.field.memo_index)
            .max()
            .unwrap_or(0)
            .saturating_add(1)
    }

    /// command 토큰 4 — 문서 공통 난수. 기존 메모가 있으면 그 값을 재사용한다.
    fn memo_doc_token(&self) -> u32 {
        self.collect_all_fields()
            .iter()
            .filter(|fi| is_memo_field(&fi.field))
            .find_map(|fi| fi.field.command.split('/').nth(4)?.parse::<u32>().ok())
            .unwrap_or_else(|| random_token(0))
    }
}

/// 한글 2024 형상의 파라미터 7종(순서 고정). `created_at` 이 None 이면 CreateDateTime 을 뺀다.
fn memo_parameters(command: &str, number: u32, author: &str, created_at: Option<&str>) -> ParameterList {
    let s = |name: &str, value: &str| Parameter::String {
        name: Some(name.to_string()),
        value: value.to_string(),
        preserve_space: false,
    };
    let mut items = vec![
        Parameter::Integer {
            name: Some("Prop".into()),
            value: 0,
        },
        s("Command", command),
        s("ID", &format!("memo{number}")),
        Parameter::Integer {
            name: Some("Number".into()),
            value: i64::from(number),
        },
        s("Author", author),
        s("MemoShapeIDRef", MEMO_SHAPE_NONE),
    ];
    if let Some(when) = created_at {
        items.push(s("CreateDateTime", when));
    }
    ParameterList {
        name: Some(String::new()),
        items,
    }
}

/// 메모 본문 문단 — 앵커(또는 기존 본문) 문단의 문단모양·스타일·글자모양을 물려받는다.
/// 빈 텍스트여도 문단 1개는 있어야 한글이 파일을 연다.
fn memo_body_paragraph(template: &Paragraph, text: &str) -> Paragraph {
    let mut p = Paragraph::new_empty_like(template);
    if !text.is_empty() {
        p.insert_text_at(0, text);
    }
    p
}

fn memo_event(target: &FieldTarget, field_id: u32) -> DocumentEvent {
    DocumentEvent::MemoChanged {
        section: target.section,
        para: target.para,
        cell_path: target.cell_path.clone(),
        field_id,
    }
}

/// 0 이 아닌 32비트 난수. OS/브라우저 엔트로피를 못 쓰면 번호를 섞은 해시로 대신한다.
fn random_token(salt: u32) -> u32 {
    let mut buf = [0u8; 4];
    let v = if getrandom::fill(&mut buf).is_ok() {
        u32::from_le_bytes(buf)
    } else {
        use std::hash::{BuildHasher, Hasher};
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u32(salt);
        h.finish() as u32
    };
    v.max(1)
}

#[cfg(test)]
mod tests {
    use crate::document_core::hyperlink::FieldTarget;
    use crate::document_core::DocumentCore;
    use crate::model::control::{Control, FieldType, Parameter};

    const AUTHOR: &str = "홍길동";
    const WHEN: &str = "2026-11-08T14:00:00Z";

    fn blank(text: &str) -> DocumentCore {
        let mut core = DocumentCore::new_empty();
        core.create_blank_document_native().unwrap();
        core.insert_text_native(0, 0, 0, text).unwrap();
        core
    }

    fn body_field(core: &DocumentCore) -> Vec<&crate::model::control::Field> {
        core.document().sections[0].paragraphs[0]
            .controls
            .iter()
            .filter_map(|c| match c {
                Control::Field(f) => Some(f),
                _ => None,
            })
            .collect()
    }

    fn string_param<'a>(f: &'a crate::model::control::Field, name: &str) -> Option<&'a str> {
        f.parameters.items.iter().find_map(|p| match p {
            Parameter::String {
                name: Some(n),
                value,
                ..
            } if n == name => Some(value.as_str()),
            _ => None,
        })
    }

    fn memo_list(core: &DocumentCore) -> Vec<serde_json::Value> {
        serde_json::from_str::<Vec<serde_json::Value>>(&core.get_memo_list_json()).unwrap()
    }

    #[test]
    fn insert_memo_creates_memo_field_with_hangul_shape() {
        let mut core = blank("가나다라마");
        let id = core
            .insert_memo_native(&FieldTarget::body(0, 0), 1, 3, AUTHOR, "확인 요망", WHEN)
            .unwrap();
        assert!(id > 0);
        let fields = body_field(&core);
        assert_eq!(fields.len(), 1);
        let f = fields[0];
        assert_eq!(f.field_type, FieldType::Memo);
        assert_eq!(f.field_id, id);
        assert_eq!(f.instance_id, Some(623_209_829));
        assert_eq!(f.memo_index, 1);
        assert!(f.command.starts_with("MEMO/65535/1/"), "{}", f.command);
        assert!(f.command.ends_with("/홍길동/\\;;"), "{}", f.command);
        assert_eq!(string_param(f, "CreateDateTime"), Some(WHEN));
        assert_eq!(string_param(f, "Author"), Some(AUTHOR));
        assert_eq!(string_param(f, "ID"), Some("memo1"));
        assert_eq!(string_param(f, "MemoShapeIDRef"), Some("65535"));
        assert_eq!(f.parameters.items.len(), 7);
        assert_eq!(f.memo_paragraphs.len(), 1);
        assert_eq!(f.memo_paragraphs[0].text, "확인 요망");
        let p = &core.document().sections[0].paragraphs[0];
        assert_eq!(p.text, "가나다라마");
        let ranges: Vec<(usize, usize)> = p
            .field_ranges
            .iter()
            .map(|r| (r.start_char_idx, r.end_char_idx))
            .collect();
        assert_eq!(ranges, vec![(1, 3)]);
    }

    #[test]
    fn insert_memo_with_empty_text_keeps_one_body_paragraph() {
        let mut core = blank("가나다라마");
        core.insert_memo_native(&FieldTarget::body(0, 0), 0, 2, AUTHOR, "", WHEN)
            .unwrap();
        let f = body_field(&core)[0];
        assert_eq!(f.memo_paragraphs.len(), 1);
        assert_eq!(f.memo_paragraphs[0].text, "");
    }

    #[test]
    fn second_memo_gets_next_index_and_reuses_doc_token() {
        let mut core = blank("가나다라마바사");
        core.insert_memo_native(&FieldTarget::body(0, 0), 0, 2, AUTHOR, "a", WHEN)
            .unwrap();
        core.insert_memo_native(&FieldTarget::body(0, 0), 4, 6, AUTHOR, "b", WHEN)
            .unwrap();
        let fields = body_field(&core);
        let mut indexes: Vec<u32> = fields.iter().map(|f| f.memo_index).collect();
        indexes.sort_unstable();
        assert_eq!(indexes, vec![1, 2]);
        let token = |f: &crate::model::control::Field| f.command.split('/').nth(4).unwrap().to_string();
        assert_eq!(token(fields[0]), token(fields[1]));
        assert_ne!(
            fields[0].command.split('/').nth(3),
            fields[1].command.split('/').nth(3),
            "메모별 난수는 서로 달라야 한다"
        );
    }

    #[test]
    fn insert_memo_rejects_overlap_with_hyperlink() {
        let mut core = blank("가나다라마");
        core.insert_hyperlink_native(&FieldTarget::body(0, 0), 0, 3, "https://example.com")
            .unwrap();
        let before = format!("{:?}", core.document());
        assert!(core
            .insert_memo_native(&FieldTarget::body(0, 0), 2, 4, AUTHOR, "x", WHEN)
            .is_err());
        assert_eq!(format!("{:?}", core.document()), before);
    }

    #[test]
    fn set_memo_text_replaces_body() {
        let mut core = blank("가나다라마");
        let id = core
            .insert_memo_native(&FieldTarget::body(0, 0), 1, 3, AUTHOR, "처음", WHEN)
            .unwrap();
        assert!(core.set_memo_text_native(&FieldTarget::body(0, 0), id, "수정").unwrap());
        assert_eq!(body_field(&core)[0].memo_paragraphs[0].text, "수정");
        assert_eq!(body_field(&core)[0].memo_paragraphs.len(), 1);
        assert!(!core.set_memo_text_native(&FieldTarget::body(0, 0), id, "수정").unwrap());
    }

    #[test]
    fn remove_memo_keeps_anchor_text() {
        let mut core = blank("가나다라마");
        let id = core
            .insert_memo_native(&FieldTarget::body(0, 0), 1, 3, AUTHOR, "x", WHEN)
            .unwrap();
        core.remove_memo_native(&FieldTarget::body(0, 0), id).unwrap();
        assert!(body_field(&core).is_empty());
        let p = &core.document().sections[0].paragraphs[0];
        assert!(p.field_ranges.is_empty());
        assert_eq!(p.text, "가나다라마");
        assert_eq!(p.char_offsets.len(), 5);
        assert_eq!(memo_list(&core).len(), 0);
    }

    #[test]
    fn memo_in_table_cell_via_cell_path() {
        let mut core = blank("");
        core.create_table_native(0, 0, 0, 1, 1).unwrap();
        let (para_idx, ctrl_idx) = core.document().sections[0]
            .paragraphs
            .iter()
            .enumerate()
            .find_map(|(pi, p)| {
                p.controls
                    .iter()
                    .position(|c| matches!(c, Control::Table(_)))
                    .map(|ci| (pi, ci))
            })
            .expect("표 문단");
        core.insert_text_in_cell_native(0, para_idx, ctrl_idx, 0, 0, 0, "셀 안 글자")
            .unwrap();
        let target = FieldTarget {
            section: 0,
            para: para_idx,
            cell_path: vec![(ctrl_idx, 0, 0)],
        };
        let id = core
            .insert_memo_native(&target, 0, 2, AUTHOR, "셀 메모", WHEN)
            .unwrap();
        let list = memo_list(&core);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["fieldId"], id);
        assert_eq!(list[0]["location"]["path"][0]["type"], "cell");
        assert_eq!(list[0]["location"]["path"][0]["cellIndex"], 0);
        assert_eq!(list[0]["text"], "셀 메모");
    }

    #[test]
    fn memo_list_json_shape() {
        let mut core = blank("가나다라마바사");
        core.insert_memo_native(&FieldTarget::body(0, 0), 4, 6, AUTHOR, "둘째", WHEN)
            .unwrap();
        core.insert_memo_native(&FieldTarget::body(0, 0), 0, 2, AUTHOR, "첫째", WHEN)
            .unwrap();
        let list = memo_list(&core);
        assert_eq!(list.len(), 2);
        let mut keys: Vec<&str> = list[0].as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "author",
                "createdAt",
                "endCharIdx",
                "fieldId",
                "location",
                "number",
                "readable",
                "startCharIdx",
                "text"
            ]
        );
        assert_eq!(list[0]["startCharIdx"], 0);
        assert_eq!(list[0]["text"], "첫째");
        assert_eq!(list[1]["startCharIdx"], 4);
        assert_eq!(list[0]["readable"], true);
        assert_eq!(list[0]["author"], AUTHOR);
        assert_eq!(list[0]["createdAt"], WHEN);
        assert_eq!(list[0]["location"]["paraIndex"], 0);
    }

    #[test]
    fn hwpx_roundtrip_preserves_api_memo() {
        let mut core = blank("가나다라마");
        core.insert_memo_native(&FieldTarget::body(0, 0), 1, 3, AUTHOR, "왕복", WHEN)
            .unwrap();
        let bytes = core.export_hwpx_native().unwrap();
        let again = DocumentCore::from_bytes(&bytes).unwrap();
        let before = memo_list(&core);
        let after = memo_list(&again);
        assert_eq!(after.len(), 1);
        for key in ["author", "createdAt", "text", "number", "startCharIdx", "endCharIdx"] {
            assert_eq!(after[0][key], before[0][key], "{key}");
        }
        assert_eq!(again.document().sections[0].paragraphs[0].text, "가나다라마");
    }
}
