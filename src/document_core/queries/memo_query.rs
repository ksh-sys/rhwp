//! 메모(검토 주석) 목록 조회 — `getMemoList` JSON.
//!
//! 필드 순회는 `field_query::collect_all_fields` 와 같다(본문 → 표 셀 → 글상자, 문서 순).
//! 머리말·꼬리말·각주 안의 메모와 여러 문단에 걸친 메모는 그 순회가 다루지 않으므로
//! 목록에 들어가지 않는다 — 파일에는 보존된다(설계서 §4.1).

use super::field_query::{field_location_json, field_range_bounds};
use crate::document_core::memo::{is_memo_field, memo_author, memo_created_at, memo_text};
use crate::document_core::DocumentCore;

impl DocumentCore {
    /// `[{fieldId, number, author, createdAt, text, readable, location, startCharIdx, endCharIdx}]`
    /// — `readable` 은 본문을 읽었는지(.hwp 출처 메모는 false).
    pub fn get_memo_list_json(&self) -> String {
        let entries: Vec<serde_json::Value> = self
            .collect_all_fields()
            .iter()
            .filter(|fi| is_memo_field(&fi.field))
            .map(|fi| {
                let (start, end) = field_range_bounds(self, fi).unwrap_or((0, 0));
                let location: serde_json::Value =
                    serde_json::from_str(&field_location_json(&fi.location))
                        .unwrap_or(serde_json::Value::Null);
                serde_json::json!({
                    "fieldId": fi.field.field_id,
                    "number": fi.field.memo_index,
                    "author": memo_author(&fi.field),
                    "createdAt": memo_created_at(&fi.field),
                    "text": memo_text(&fi.field),
                    "readable": !fi.field.memo_paragraphs.is_empty(),
                    "location": location,
                    "startCharIdx": start,
                    "endCharIdx": end,
                })
            })
            .collect();
        serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
    }
}
