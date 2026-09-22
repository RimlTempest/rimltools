//! `codes.*` の手続き。
//!
//! 一覧は 1 ページぶん + 1 行だけ読む。`OFFSET` を使わないので、
//! 何ページ目でも読み取り行数が変わらない（docs/free-tier-budget.md）。

use qrcc_kernel::{CodeId, CommonRpcError, FolderId, UserId};
use serde_json::{Value, json};

use crate::cursor::Cursor;
use crate::input;
use crate::query::{self, CODE_COLUMNS};
use crate::row;
use crate::service::{ManageRequest, changed, not_found, require_actor, storage, to_column};
use crate::store::{Param, Sql, Statement};

const SHARE_COLUMNS: &str = "token, code_id, permission, expires_at, created_at, revoked_at";

const INSERT_CODE: &str = "INSERT INTO code \
    (id, owner_id, folder_id, name, kind, payload, symbology, style, idempotency_key, created_at, updated_at) \
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

const UPDATE_CODE: &str = "UPDATE code \
    SET folder_id = ?, name = ?, kind = ?, payload = ?, symbology = ?, style = ?, updated_at = ? \
    WHERE id = ? AND owner_id = ?";

/// フォルダが自分のものか。他人のフォルダにコードを差し込めないようにする。
async fn ensure_folder_owned<S: Sql>(
    sql: &S,
    owner: &UserId,
    folder: &FolderId,
) -> Result<(), CommonRpcError> {
    let rows = sql
        .all(&Statement::new(
            "SELECT id FROM folder WHERE id = ? AND owner_id = ?",
            vec![Param::text(folder.as_str()), Param::text(owner.as_str())],
        ))
        .await
        .map_err(storage)?;
    if rows.is_empty() {
        return Err(not_found("folder"));
    }
    Ok(())
}

async fn find_code<S: Sql>(
    sql: &S,
    owner: &UserId,
    id: &CodeId,
) -> Result<Option<Value>, CommonRpcError> {
    let rows = sql
        .all(&Statement::new(
            format!("SELECT {CODE_COLUMNS} FROM code WHERE id = ? AND owner_id = ?"),
            vec![Param::text(id.as_str()), Param::text(owner.as_str())],
        ))
        .await
        .map_err(storage)?;
    match rows.first() {
        None => Ok(None),
        Some(found) => row::to_code(found)
            .map(Some)
            .ok_or(CommonRpcError::Internal),
    }
}

/// 同じ Idempotency-Key で作られた行を探す。あれば「もう作ってある」と答える。
async fn find_by_idempotency<S: Sql>(
    sql: &S,
    owner: &UserId,
    key: &str,
) -> Result<Option<Value>, CommonRpcError> {
    let rows = sql
        .all(&Statement::new(
            format!("SELECT {CODE_COLUMNS} FROM code WHERE owner_id = ? AND idempotency_key = ?"),
            vec![Param::text(owner.as_str()), Param::text(key)],
        ))
        .await
        .map_err(storage)?;
    match rows.first() {
        None => Ok(None),
        Some(found) => row::to_code(found)
            .map(Some)
            .ok_or(CommonRpcError::Internal),
    }
}

pub async fn list<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let list = input::parse_list(request.body, owner)?;
    let rows = sql
        .all(&query::list_statement(&list))
        .await
        .map_err(storage)?;

    let limit = list.limit as usize;
    let has_more = rows.len() > limit;
    let page = rows.get(..limit.min(rows.len())).unwrap_or_default();

    let mut items = Vec::with_capacity(page.len());
    for found in page {
        items.push(row::to_summary(found).ok_or(CommonRpcError::Internal)?);
    }

    // 次のカーソルは「最後に返した行」から作る。読み過ぎた 1 行は返さない。
    let next_cursor = match (has_more, page.last()) {
        (true, Some(last)) => {
            let id = row::read_text(last, "id").ok_or(CommonRpcError::Internal)?;
            let key =
                row::sort_key(last, list.sort.key_column()).ok_or(CommonRpcError::Internal)?;
            Some(
                Cursor {
                    sort: list.sort,
                    id: CodeId::parse(&id).map_err(|_| CommonRpcError::Internal)?,
                    key,
                }
                .encode(),
            )
        }
        _ => None,
    };

    Ok(json!({ "items": items, "next_cursor": next_cursor }))
}

pub async fn get<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let id = input::parse_code_id(request.body)?;
    let code = find_code(sql, owner, &id)
        .await?
        .ok_or_else(|| not_found("code"))?;

    // 取り消し済みは返さない。画面が出すのは「いま有効なリンク」だけ。
    let rows = sql
        .all(&Statement::new(
            format!(
                "SELECT {SHARE_COLUMNS} FROM share_link \
                 WHERE code_id = ? AND revoked_at IS NULL ORDER BY created_at DESC"
            ),
            vec![Param::text(id.as_str())],
        ))
        .await
        .map_err(storage)?;

    let mut shares = Vec::with_capacity(rows.len());
    for found in &rows {
        shares.push(row::to_share(found).ok_or(CommonRpcError::Internal)?);
    }

    Ok(json!({ "code": code, "shares": shares }))
}

pub async fn create<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let draft = input::parse_code_draft(request.body)?;
    let kind = draft.kind()?;

    // 同じキーで既に作ってあれば、そのまま返す（二重作成を防ぐ）。
    if let Some(key) = request.idempotency_key
        && let Some(existing) = find_by_idempotency(sql, owner, key).await?
    {
        return Ok(existing);
    }
    if let Some(folder) = &draft.folder_id {
        ensure_folder_owned(sql, owner, folder).await?;
    }

    let statement = Statement::new(
        INSERT_CODE,
        vec![
            Param::text(draft.id.as_str()),
            Param::text(owner.as_str()),
            Param::opt_text(draft.folder_id.as_ref().map(|id| id.as_str().to_string())),
            Param::text(draft.name.clone()),
            Param::text(kind.clone()),
            Param::text(to_column(&draft.payload)?),
            Param::text(to_column(&draft.symbology)?),
            Param::text(to_column(&draft.style)?),
            Param::opt_text(request.idempotency_key),
            Param::Int(request.now),
            Param::Int(request.now),
        ],
    );

    if let Err(cause) = sql.write(&[statement]).await {
        // 一意制約に当たったのかもしれない。同じキーの行があるなら、
        // 先に走った実行が作ったものなので、それを答えにする。
        if let Some(key) = request.idempotency_key
            && let Some(existing) = find_by_idempotency(sql, owner, key).await?
        {
            return Ok(existing);
        }
        return Err(storage(cause));
    }

    // 書いた内容はここで分かっている。確認のためだけに読み直さない。
    Ok(json!({
        "id": draft.id.as_str(),
        "owner_id": owner.as_str(),
        "folder_id": draft.folder_id.as_ref().map(|id| id.as_str()),
        "name": draft.name,
        "kind": kind,
        "payload": draft.payload,
        "symbology": draft.symbology,
        "style": draft.style,
        "created_at": request.now,
        "updated_at": request.now,
    }))
}

/// 部分更新ではなく**全置換**。差分の三値（未指定・null・値）を扱わずに済み、
/// 画面が持っている状態をそのまま送れる。
pub async fn update<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let draft = input::parse_code_draft(request.body)?;
    let kind = draft.kind()?;

    if let Some(folder) = &draft.folder_id {
        ensure_folder_owned(sql, owner, folder).await?;
    }

    let changes = sql
        .write(&[Statement::new(
            UPDATE_CODE,
            vec![
                Param::opt_text(draft.folder_id.as_ref().map(|id| id.as_str().to_string())),
                Param::text(draft.name.clone()),
                Param::text(kind),
                Param::text(to_column(&draft.payload)?),
                Param::text(to_column(&draft.symbology)?),
                Param::text(to_column(&draft.style)?),
                Param::Int(request.now),
                Param::text(draft.id.as_str()),
                Param::text(owner.as_str()),
            ],
        )])
        .await
        .map_err(storage)?;

    if changed(&changes) == 0 {
        return Err(not_found("code"));
    }
    Ok(json!({ "id": draft.id.as_str(), "updated_at": request.now }))
}

pub async fn delete<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let id = input::parse_code_id(request.body)?;

    let changes = sql
        .write(&[Statement::new(
            "DELETE FROM code WHERE id = ? AND owner_id = ?",
            vec![Param::text(id.as_str()), Param::text(owner.as_str())],
        )])
        .await
        .map_err(storage)?;

    if changed(&changes) == 0 {
        return Err(not_found("code"));
    }
    Ok(json!({ "id": id.as_str() }))
}
