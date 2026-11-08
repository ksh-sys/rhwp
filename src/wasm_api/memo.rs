//! Studio 메모(검토 주석)의 엄격한 JSON options 어댑터 — 하이퍼링크(`hyperlink.rs`)와 같은 틀.
use super::HwpDocument;
use crate::document_core::hyperlink::FieldTarget;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

fn parse<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, JsValue> {
    serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertMemoOptions {
    target: FieldTarget,
    start: usize,
    end: usize,
    author: String,
    text: String,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MemoTextOptions {
    target: FieldTarget,
    field_id: u32,
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveMemoOptions {
    target: FieldTarget,
    field_id: u32,
}

#[wasm_bindgen]
impl HwpDocument {
    /// `{target, start, end, author, text, createdAt}` → 새 field_id. 표시 문자는 Unicode scalar 축.
    #[wasm_bindgen(js_name = insertMemoEx)]
    pub fn insert_memo_ex(&mut self, options_json: &str) -> Result<u32, JsValue> {
        let o: InsertMemoOptions = parse(options_json)?;
        self.core
            .insert_memo_native(&o.target, o.start, o.end, &o.author, &o.text, &o.created_at)
            .map_err(Into::into)
    }

    /// `{target, fieldId, text}` → 바뀌었으면 true.
    #[wasm_bindgen(js_name = setMemoTextEx)]
    pub fn set_memo_text_ex(&mut self, options_json: &str) -> Result<bool, JsValue> {
        let o: MemoTextOptions = parse(options_json)?;
        self.core
            .set_memo_text_native(&o.target, o.field_id, &o.text)
            .map_err(Into::into)
    }

    /// `{target, fieldId}` — 대상 글자는 남는다.
    #[wasm_bindgen(js_name = removeMemoEx)]
    pub fn remove_memo_ex(&mut self, options_json: &str) -> Result<(), JsValue> {
        let o: RemoveMemoOptions = parse(options_json)?;
        self.core
            .remove_memo_native(&o.target, o.field_id)
            .map_err(Into::into)
    }

    /// 문서의 메모 목록 JSON — `document_core::queries::memo_query` 참조.
    #[wasm_bindgen(js_name = getMemoList)]
    pub fn get_memo_list(&self) -> String {
        self.core.get_memo_list_json()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_memo_options_reject_unknown_keys() {
        let ok = r#"{"target":{"section":0,"para":0,"cellPath":[]},"start":0,"end":1,"author":"a","text":"","createdAt":""}"#;
        assert!(serde_json::from_str::<InsertMemoOptions>(ok).is_ok());
        let unknown = r#"{"target":{"section":0,"para":0,"cellPath":[]},"start":0,"end":1,"author":"a","text":"","createdAt":"","unknown":1}"#;
        assert!(serde_json::from_str::<InsertMemoOptions>(unknown).is_err());
        assert!(serde_json::from_str::<MemoTextOptions>(r#"{"target":{"section":0,"para":0,"cellPath":[]},"fieldId":3,"text":"x","extra":true}"#).is_err());
        assert!(serde_json::from_str::<RemoveMemoOptions>(r#"{"target":{"section":0,"para":0,"cellPath":[]},"fieldId":3}"#).is_ok());
    }
}
