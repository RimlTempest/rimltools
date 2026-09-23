//! D1 の行を、そのまま封筒に載る JSON に直す純粋な部分。
//!
//! `payload` / `symbology` / `style` は TEXT 列に入った JSON なので、
//! **読み出しのたびにここでパースする**（docs/domain-model.md 9 節）。
//! 壊れた行は握りつぶさず `None` にして、呼び出し側に失敗として扱わせる。

use serde_json::{Value, json};

use crate::query::{CODE_COLUMNS, SUMMARY_COLUMNS};
use crate::store::Row;

/// D1 の整数は JS の number として届くので、i64 と f64 の両方を受ける。
pub fn read_int(row: &Row, key: &str) -> Option<i64> {
    let value = row.get(key)?;
    value
        .as_i64()
        .or_else(|| value.as_f64().map(|number| number as i64))
}

pub fn read_text(row: &Row, key: &str) -> Option<String> {
    Some(row.get(key)?.as_str()?.to_string())
}

/// NULL を「値なし」として読む。列自体が無い場合は `None`（= 行が壊れている）。
pub fn read_opt_text(row: &Row, key: &str) -> Option<Option<String>> {
    let value = row.get(key)?;
    if value.is_null() {
        return Some(None);
    }
    Some(Some(value.as_str()?.to_string()))
}

pub fn read_opt_int(row: &Row, key: &str) -> Option<Option<i64>> {
    let value = row.get(key)?;
    if value.is_null() {
        return Some(None);
    }
    Some(Some(read_int(row, key)?))
}

/// JSON 1 列を読む。文字列として保存されているので、必ずここを通す。
pub fn read_json(row: &Row, key: &str) -> Option<Value> {
    serde_json::from_str(row.get(key)?.as_str()?).ok()
}

fn opt_value(text: Option<String>) -> Value {
    match text {
        Some(value) => Value::String(value),
        None => Value::Null,
    }
}

/// 一覧の 1 行（`SUMMARY_COLUMNS` の並び）。
pub fn to_summary(row: &Row) -> Option<Value> {
    Some(json!({
        "id": read_text(row, "id")?,
        "name": read_text(row, "name")?,
        "kind": read_text(row, "kind")?,
        "folder_id": opt_value(read_opt_text(row, "folder_id")?),
        "updated_at": read_int(row, "updated_at")?,
    }))
}

/// 詳細の 1 行（`CODE_COLUMNS` の並び）。
pub fn to_code(row: &Row) -> Option<Value> {
    Some(json!({
        "id": read_text(row, "id")?,
        "owner_id": read_text(row, "owner_id")?,
        "folder_id": opt_value(read_opt_text(row, "folder_id")?),
        "name": read_text(row, "name")?,
        "kind": read_text(row, "kind")?,
        "payload": read_json(row, "payload")?,
        "symbology": read_json(row, "symbology")?,
        "style": read_json(row, "style")?,
        "created_at": read_int(row, "created_at")?,
        "updated_at": read_int(row, "updated_at")?,
    }))
}

pub fn to_share(row: &Row) -> Option<Value> {
    Some(json!({
        "token": read_text(row, "token")?,
        "code_id": read_text(row, "code_id")?,
        "permission": read_text(row, "permission")?,
        "expires_at": read_opt_int(row, "expires_at")?,
        "created_at": read_int(row, "created_at")?,
        "revoked_at": read_opt_int(row, "revoked_at")?,
    }))
}

/// 並べ替えキーの現在値。次のページのカーソルに載せる。
pub fn sort_key(row: &Row, column: &str) -> Option<String> {
    if column == "updated_at" {
        return Some(read_int(row, column)?.to_string());
    }
    read_text(row, column)
}

/// 列名の並びが SELECT と食い違っていないことを、テストから確かめられるようにする。
pub fn summary_columns() -> Vec<&'static str> {
    SUMMARY_COLUMNS.split(", ").collect()
}

pub fn code_columns() -> Vec<&'static str> {
    CODE_COLUMNS.split(", ").collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Map;

    fn row(pairs: &[(&str, Value)]) -> Row {
        let mut row = Map::new();
        for (key, value) in pairs {
            row.insert((*key).to_string(), value.clone());
        }
        row
    }

    fn code_row() -> Row {
        row(&[
            ("id", json!("cd_0123456789abcdefghjkmnpq")),
            ("owner_id", json!("usr_0123456789abcdefghjkmnpq")),
            ("folder_id", Value::Null),
            ("name", json!("在庫ラベル")),
            ("kind", json!("qr")),
            ("payload", json!(r#"{"kind":"text","text":"ABC"}"#)),
            ("symbology", json!(r#"{"kind":"qr","ec":"M"}"#)),
            ("style", json!(r#"{"scale":6}"#)),
            ("created_at", json!(1_788_220_800_i64)),
            ("updated_at", json!(1_788_307_200_i64)),
        ])
    }

    /// JSON 列は文字列で入っている。素通しすると画面側で二重にパースする羽目になる。
    #[test]
    fn parses_the_json_columns_instead_of_passing_the_text_through() {
        let code = to_code(&code_row()).expect("row is well formed");
        assert_eq!(code["payload"], json!({ "kind": "text", "text": "ABC" }));
        assert_eq!(code["symbology"], json!({ "kind": "qr", "ec": "M" }));
        assert_eq!(code["style"], json!({ "scale": 6 }));
    }

    #[test]
    fn reports_a_broken_json_column_instead_of_hiding_it() {
        let mut broken = code_row();
        broken.insert("payload".to_string(), json!("{not json"));
        assert_eq!(to_code(&broken), None);
    }

    #[test]
    fn reports_a_missing_column() {
        let mut broken = code_row();
        broken.remove("name");
        assert_eq!(to_code(&broken), None);
    }

    #[test]
    fn keeps_an_unfiled_code_unfiled() {
        let code = to_code(&code_row()).expect("row is well formed");
        assert_eq!(code["folder_id"], Value::Null);
    }

    #[test]
    fn reads_integers_that_arrive_as_javascript_numbers() {
        let numeric = row(&[("updated_at", json!(1_788_307_200.0))]);
        assert_eq!(read_int(&numeric, "updated_at"), Some(1_788_307_200));
    }

    #[test]
    fn summarises_only_the_columns_the_list_needs() {
        let summary = to_summary(&code_row()).expect("row is well formed");
        let keys: Vec<&String> = summary.as_object().expect("object").keys().collect();
        assert_eq!(keys.len(), summary_columns().len());
        for column in summary_columns() {
            assert!(summary.get(column).is_some(), "column: {column}");
        }
    }

    #[test]
    fn details_carry_every_selected_column() {
        let code = to_code(&code_row()).expect("row is well formed");
        for column in code_columns() {
            assert!(code.get(column).is_some(), "column: {column}");
        }
    }

    #[test]
    fn reads_a_share_link_with_and_without_an_expiry() {
        let base = row(&[
            ("token", json!("abcdefghjkmnpqrstvwxyz0123456789")),
            ("code_id", json!("cd_0123456789abcdefghjkmnpq")),
            ("permission", json!("view")),
            ("expires_at", Value::Null),
            ("created_at", json!(1_788_220_800_i64)),
            ("revoked_at", Value::Null),
        ]);
        let unlimited = to_share(&base).expect("row is well formed");
        assert_eq!(unlimited["expires_at"], Value::Null);
        assert_eq!(unlimited["revoked_at"], Value::Null);

        let mut expiring = base.clone();
        expiring.insert("expires_at".to_string(), json!(1_790_899_200_i64));
        let limited = to_share(&expiring).expect("row is well formed");
        assert_eq!(limited["expires_at"], json!(1_790_899_200_i64));
    }

    #[test]
    fn takes_the_cursor_key_from_the_sorted_column() {
        assert_eq!(
            sort_key(&code_row(), "updated_at"),
            Some("1788307200".to_string())
        );
        assert_eq!(
            sort_key(&code_row(), "name"),
            Some("在庫ラベル".to_string())
        );
    }
}
