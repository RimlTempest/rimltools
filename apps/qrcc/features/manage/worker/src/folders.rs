//! `folders.*` の手続き。ネストしない入れ物なので、木構造の判断は要らない。

use qrcc_kernel::CommonRpcError;
use serde_json::{Value, json};

use crate::input;
use crate::query::MAX_FOLDERS;
use crate::row;
use crate::service::{ManageRequest, changed, not_found, require_actor, storage};
use crate::store::{Param, Sql, Statement};

pub async fn list<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let rows = sql
        .all(&Statement::new(
            "SELECT id, name, updated_at FROM folder WHERE owner_id = ? ORDER BY name ASC, id ASC LIMIT ?",
            vec![Param::text(owner.as_str()), Param::Int(i64::from(MAX_FOLDERS))],
        ))
        .await
        .map_err(storage)?;

    let mut items = Vec::with_capacity(rows.len());
    for found in &rows {
        items.push(json!({
            "id": row::read_text(found, "id").ok_or(CommonRpcError::Internal)?,
            "name": row::read_text(found, "name").ok_or(CommonRpcError::Internal)?,
            "updated_at": row::read_int(found, "updated_at").ok_or(CommonRpcError::Internal)?,
        }));
    }
    Ok(json!({ "items": items }))
}

pub async fn create<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let draft = input::parse_folder_draft(request.body)?;

    sql.write(&[Statement::new(
        "INSERT INTO folder (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        vec![
            Param::text(draft.id.as_str()),
            Param::text(owner.as_str()),
            Param::text(draft.name.clone()),
            Param::Int(request.now),
            Param::Int(request.now),
        ],
    )])
    .await
    .map_err(storage)?;

    Ok(json!({ "id": draft.id.as_str(), "name": draft.name, "updated_at": request.now }))
}

pub async fn update<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let draft = input::parse_folder_draft(request.body)?;

    let changes = sql
        .write(&[Statement::new(
            "UPDATE folder SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
            vec![
                Param::text(draft.name.clone()),
                Param::Int(request.now),
                Param::text(draft.id.as_str()),
                Param::text(owner.as_str()),
            ],
        )])
        .await
        .map_err(storage)?;

    if changed(&changes) == 0 {
        return Err(not_found("folder"));
    }
    Ok(json!({ "id": draft.id.as_str(), "name": draft.name, "updated_at": request.now }))
}

/// フォルダを消してもコードは消さない（`ON DELETE SET NULL`）。
/// 入れ物を捨てただけで中身まで失うのは、取り返しがつかない。
pub async fn delete<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let id = input::parse_folder_id(request.body)?;

    let changes = sql
        .write(&[Statement::new(
            "DELETE FROM folder WHERE id = ? AND owner_id = ?",
            vec![Param::text(id.as_str()), Param::text(owner.as_str())],
        )])
        .await
        .map_err(storage)?;

    if changed(&changes) == 0 {
        return Err(not_found("folder"));
    }
    Ok(json!({ "id": id.as_str() }))
}
