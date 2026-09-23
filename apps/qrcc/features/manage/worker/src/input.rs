//! 要求本文の読み取りと検証（純粋）。
//!
//! ここで守っているのは「保存できる形かどうか」だけで、
//! **「誰に何が許されるか」は見ない**。認可は qrcc-web が済ませている
//! 前提で動く auxiliary Worker だから（ADR-0002）。
//!
//! 認可の判断（ゲストは編集権限の共有リンクを作れない、など）を
//! ここにも書くと、規則が 2 箇所に散って必ず片方だけ古くなる。

use qrcc_kernel::{CodeId, CommonRpcError, FolderId, ShareToken, UserId};
use serde::Deserialize;
use serde_json::Value;

use crate::cursor::{CodeSort, Cursor};
use crate::query::{ListQuery, clamp_limit};

/// 名前の上限（文字数）。一覧の 1 行が読みにくくならない範囲。
pub const MAX_NAME_LENGTH: usize = 200;

/// 本文が読めない = qrcc-web の配線の不具合。利用者に見せる情報はないので internal。
fn malformed() -> CommonRpcError {
    CommonRpcError::Internal
}

fn too_long(limit: &str, actual: usize) -> CommonRpcError {
    CommonRpcError::LimitExceeded {
        limit: limit.to_string(),
        max: MAX_NAME_LENGTH as u64,
        actual: actual as u64,
    }
}

/// 前後の空白を落として長さを見る。空白だけの名前は「名前なし」と同じ。
pub fn checked_name(raw: &str, limit: &str) -> Result<String, CommonRpcError> {
    let name = raw.trim();
    let length = name.chars().count();
    if length == 0 {
        return Err(malformed());
    }
    if length > MAX_NAME_LENGTH {
        return Err(too_long(limit, length));
    }
    Ok(name.to_string())
}

fn parse_body<T: for<'de> Deserialize<'de>>(body: &Value) -> Result<T, CommonRpcError> {
    serde_json::from_value(body.clone()).map_err(|_| malformed())
}

#[derive(Debug, Deserialize)]
struct ListInput {
    folder_id: Option<FolderId>,
    query: Option<String>,
    sort: CodeSort,
    limit: u32,
    cursor: Option<String>,
}

/// 一覧の要求。カーソルと並べ替えの食い違いは黙って直さない
/// （直すと行が飛んだり重複したりする）。
pub fn parse_list(body: &Value, owner: &UserId) -> Result<ListQuery, CommonRpcError> {
    let input: ListInput = parse_body(body)?;
    let cursor = match input.cursor.as_deref().filter(|raw| !raw.is_empty()) {
        None => None,
        Some(raw) => {
            let cursor = Cursor::decode(raw).ok_or(CommonRpcError::NotFound {
                resource: "cursor".to_string(),
            })?;
            if cursor.sort != input.sort {
                return Err(CommonRpcError::NotFound {
                    resource: "cursor".to_string(),
                });
            }
            Some(cursor)
        }
    };

    Ok(ListQuery {
        owner: owner.clone(),
        folder: input.folder_id,
        query: input.query,
        sort: input.sort,
        limit: clamp_limit(input.limit),
        cursor,
    })
}

/// 保存・上書きで送られてくる内容。
///
/// `id` は qrcc-web が発行する（`newCodeId`）。この Worker は乱数源を持たず、
/// 受け取った id の**形**だけを検証する。乱数と時計を持ち込まないので、
/// ここの判断はすべて単体テストできる。
#[derive(Debug, PartialEq, Deserialize)]
pub struct CodeDraft {
    pub id: CodeId,
    pub name: String,
    pub folder_id: Option<FolderId>,
    pub payload: Value,
    pub symbology: Value,
    pub style: Value,
}

impl CodeDraft {
    /// 一覧の絞り込みに使う `kind` 列は symbology の種類そのもの。
    /// JSON の中から取り出して実列に写す（JSON を検索対象にしないため）。
    pub fn kind(&self) -> Result<String, CommonRpcError> {
        self.symbology
            .get("kind")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(malformed)
    }
}

pub fn parse_code_draft(body: &Value) -> Result<CodeDraft, CommonRpcError> {
    let mut draft: CodeDraft = parse_body(body)?;
    draft.name = checked_name(&draft.name, "code.name")?;
    if !draft.payload.is_object() || !draft.symbology.is_object() || !draft.style.is_object() {
        return Err(malformed());
    }
    Ok(draft)
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct FolderDraft {
    pub id: FolderId,
    pub name: String,
}

pub fn parse_folder_draft(body: &Value) -> Result<FolderDraft, CommonRpcError> {
    let mut draft: FolderDraft = parse_body(body)?;
    draft.name = checked_name(&draft.name, "folder.name")?;
    Ok(draft)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SharePermission {
    View,
    Edit,
}

impl SharePermission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::View => "view",
            Self::Edit => "edit",
        }
    }
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct ShareDraft {
    pub code_id: CodeId,
    pub token: ShareToken,
    pub permission: SharePermission,
    /// `None` は無期限。ゲストが選べないことは qrcc-web が保証する。
    pub expires_at: Option<i64>,
}

pub fn parse_share_draft(body: &Value) -> Result<ShareDraft, CommonRpcError> {
    parse_body(body)
}

#[derive(Debug, Deserialize)]
struct CodeIdInput {
    id: CodeId,
}

pub fn parse_code_id(body: &Value) -> Result<CodeId, CommonRpcError> {
    let input: CodeIdInput = parse_body(body)?;
    Ok(input.id)
}

#[derive(Debug, Deserialize)]
struct FolderIdInput {
    id: FolderId,
}

pub fn parse_folder_id(body: &Value) -> Result<FolderId, CommonRpcError> {
    let input: FolderIdInput = parse_body(body)?;
    Ok(input.id)
}

#[derive(Debug, Deserialize)]
struct TokenInput {
    token: ShareToken,
}

pub fn parse_token(body: &Value) -> Result<ShareToken, CommonRpcError> {
    let input: TokenInput = parse_body(body)?;
    Ok(input.token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn owner() -> UserId {
        UserId::parse("usr_0123456789abcdefghjkmnpq").expect("fixture")
    }

    fn list_body() -> Value {
        json!({
            "folder_id": null,
            "query": null,
            "sort": "updated_desc",
            "limit": 20,
            "cursor": null
        })
    }

    #[test]
    fn reads_a_list_request() {
        let query = parse_list(&list_body(), &owner()).expect("valid");
        assert_eq!(query.owner, owner());
        assert_eq!(query.sort, CodeSort::UpdatedDesc);
        assert_eq!(query.limit, 20);
        assert_eq!(query.cursor, None);
    }

    #[test]
    fn clamps_the_requested_page_size() {
        let mut body = list_body();
        body["limit"] = json!(9_999);
        assert_eq!(parse_list(&body, &owner()).expect("valid").limit, 50);
    }

    /// 並べ替えを変えたのに古いカーソルで続きを読むと、行が飛んだり重複したりする。
    #[test]
    fn refuses_a_cursor_that_belongs_to_another_sort() {
        let mut body = list_body();
        body["cursor"] = json!("name_asc:cd_0123456789abcdefghjkmnpq:x");
        assert_eq!(
            parse_list(&body, &owner()),
            Err(CommonRpcError::NotFound {
                resource: "cursor".to_string()
            })
        );
    }

    #[test]
    fn refuses_a_malformed_cursor() {
        let mut body = list_body();
        body["cursor"] = json!("nonsense");
        assert!(parse_list(&body, &owner()).is_err());
    }

    #[test]
    fn refuses_an_unknown_sort() {
        let mut body = list_body();
        body["sort"] = json!("size_asc");
        assert_eq!(parse_list(&body, &owner()), Err(CommonRpcError::Internal));
    }

    fn draft_body() -> Value {
        json!({
            "id": "cd_0123456789abcdefghjkmnpq",
            "name": "  在庫ラベル  ",
            "folder_id": null,
            "payload": { "kind": "text", "text": "ABC" },
            "symbology": { "kind": "qr", "ec": "M" },
            "style": { "scale": 6 }
        })
    }

    #[test]
    fn trims_the_name_and_lifts_the_symbology_kind_into_its_own_column() {
        let draft = parse_code_draft(&draft_body()).expect("valid");
        assert_eq!(draft.name, "在庫ラベル");
        assert_eq!(draft.kind().expect("kind"), "qr");
    }

    #[test]
    fn refuses_a_blank_name() {
        let mut body = draft_body();
        body["name"] = json!("   ");
        assert_eq!(parse_code_draft(&body), Err(CommonRpcError::Internal));
    }

    #[test]
    fn refuses_a_name_over_the_limit_and_says_how_long_it_was() {
        let mut body = draft_body();
        body["name"] = json!("あ".repeat(MAX_NAME_LENGTH + 1));
        assert_eq!(
            parse_code_draft(&body),
            Err(CommonRpcError::LimitExceeded {
                limit: "code.name".to_string(),
                max: MAX_NAME_LENGTH as u64,
                actual: (MAX_NAME_LENGTH + 1) as u64,
            })
        );
    }

    #[test]
    fn accepts_a_name_exactly_at_the_limit() {
        let mut body = draft_body();
        body["name"] = json!("あ".repeat(MAX_NAME_LENGTH));
        assert!(parse_code_draft(&body).is_ok());
    }

    #[test]
    fn refuses_an_id_of_the_wrong_kind() {
        let mut body = draft_body();
        body["id"] = json!("fld_0123456789abcdefghjkmnpq");
        assert!(parse_code_draft(&body).is_err());
    }

    #[test]
    fn refuses_a_symbology_without_a_kind() {
        let mut body = draft_body();
        body["symbology"] = json!({ "ec": "M" });
        assert!(parse_code_draft(&body).expect("parses").kind().is_err());
    }

    #[test]
    fn refuses_a_payload_that_is_not_an_object() {
        let mut body = draft_body();
        body["payload"] = json!("ABC");
        assert!(parse_code_draft(&body).is_err());
    }

    #[test]
    fn reads_a_share_draft_with_and_without_an_expiry() {
        let body = json!({
            "code_id": "cd_0123456789abcdefghjkmnpq",
            "token": "abcdefghjkmnpqrstvwxyz0123456789",
            "permission": "view",
            "expires_at": 1_790_899_200_i64
        });
        let draft = parse_share_draft(&body).expect("valid");
        assert_eq!(draft.permission, SharePermission::View);
        assert_eq!(draft.expires_at, Some(1_790_899_200));

        let mut forever = body;
        forever["expires_at"] = Value::Null;
        forever["permission"] = json!("edit");
        let draft = parse_share_draft(&forever).expect("valid");
        assert_eq!(draft.permission, SharePermission::Edit);
        assert_eq!(draft.expires_at, None);
    }

    #[test]
    fn refuses_an_unknown_permission() {
        let body = json!({
            "code_id": "cd_0123456789abcdefghjkmnpq",
            "token": "abcdefghjkmnpqrstvwxyz0123456789",
            "permission": "admin",
            "expires_at": null
        });
        assert!(parse_share_draft(&body).is_err());
    }

    #[test]
    fn refuses_a_share_token_of_the_wrong_shape() {
        let body = json!({
            "code_id": "cd_0123456789abcdefghjkmnpq",
            "token": "short",
            "permission": "view",
            "expires_at": null
        });
        assert!(parse_share_draft(&body).is_err());
    }
}
