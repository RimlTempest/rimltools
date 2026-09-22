//! `shares.*` の手続き。
//!
//! **ここでゲストの制約（編集権限・無期限を作れない）は判定しない。**
//! 認可は qrcc-web の `authorizeShareLink` が行い、この Worker は
//! 通った値を保存するだけ（ADR-0002 / ADR-0004）。判定を 2 箇所に書くと、
//! 必ず片方だけが古くなる。

use qrcc_kernel::{CommonRpcError, ShareToken, UserId};
use serde_json::{Value, json};

use crate::input;
use crate::query::CODE_COLUMNS;
use crate::row;
use crate::service::{ManageRequest, changed, not_found, require_actor, storage};
use crate::store::{Param, Sql, Statement};

const SHARE_COLUMNS: &str = "token, code_id, permission, expires_at, created_at, revoked_at";

const INSERT_SHARE: &str = "INSERT INTO share_link \
    (token, code_id, permission, expires_at, created_by, created_at, revoked_at, idempotency_key) \
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)";

async fn find_by_idempotency<S: Sql>(
    sql: &S,
    owner: &UserId,
    key: &str,
) -> Result<Option<Value>, CommonRpcError> {
    let rows = sql
        .all(&Statement::new(
            format!(
                "SELECT {SHARE_COLUMNS} FROM share_link WHERE created_by = ? AND idempotency_key = ?"
            ),
            vec![Param::text(owner.as_str()), Param::text(key)],
        ))
        .await
        .map_err(storage)?;
    match rows.first() {
        None => Ok(None),
        Some(found) => row::to_share(found)
            .map(Some)
            .ok_or(CommonRpcError::Internal),
    }
}

pub async fn create<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let draft = input::parse_share_draft(request.body)?;

    if let Some(key) = request.idempotency_key
        && let Some(existing) = find_by_idempotency(sql, owner, key).await?
    {
        return Ok(existing);
    }

    // 自分のコードにしかリンクを張れない。
    let owned = sql
        .all(&Statement::new(
            "SELECT id FROM code WHERE id = ? AND owner_id = ?",
            vec![
                Param::text(draft.code_id.as_str()),
                Param::text(owner.as_str()),
            ],
        ))
        .await
        .map_err(storage)?;
    if owned.is_empty() {
        return Err(not_found("code"));
    }

    let statement = Statement::new(
        INSERT_SHARE,
        vec![
            Param::text(draft.token.as_str()),
            Param::text(draft.code_id.as_str()),
            Param::text(draft.permission.as_str()),
            Param::opt_int(draft.expires_at),
            Param::text(owner.as_str()),
            Param::Int(request.now),
            Param::opt_text(request.idempotency_key),
        ],
    );

    if let Err(cause) = sql.write(&[statement]).await {
        if let Some(key) = request.idempotency_key
            && let Some(existing) = find_by_idempotency(sql, owner, key).await?
        {
            return Ok(existing);
        }
        return Err(storage(cause));
    }

    Ok(json!({
        "token": draft.token.as_str(),
        "code_id": draft.code_id.as_str(),
        "permission": draft.permission.as_str(),
        "expires_at": draft.expires_at,
        "created_at": request.now,
        "revoked_at": Value::Null,
    }))
}

/// 取り消しは行を消さずに印を付ける。いつ取り消したかが残り、
/// 同じトークンが再発行されることもない。
pub async fn revoke<S: Sql>(sql: &S, request: &ManageRequest<'_>) -> Result<Value, CommonRpcError> {
    let owner = require_actor(request)?;
    let token = input::parse_token(request.body)?;

    let changes = sql
        .write(&[Statement::new(
            "UPDATE share_link SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL \
             AND code_id IN (SELECT id FROM code WHERE owner_id = ?)",
            vec![
                Param::Int(request.now),
                Param::text(token.as_str()),
                Param::text(owner.as_str()),
            ],
        )])
        .await
        .map_err(storage)?;

    if changed(&changes) == 0 {
        return Err(not_found("share"));
    }
    Ok(json!({ "token": token.as_str(), "revoked_at": request.now }))
}

/// 開けなかった理由を 1 段だけ返す。
///
/// **見つからなかったときにしか引かない**ので、通常の読み取り数は増えない。
/// 期限切れを「無い」と同じ文言にすると、受け取った人は次にすること
/// （発行者に新しいリンクを頼む／URL を確かめ直す）を選べない。
/// トークンは 160 bit の乱数なので、当てずっぽうで「あったこと」を
/// 引き出せる形にはならない。取り消し済みは「無い」に畳む。
async fn explain_absence<S: Sql>(sql: &S, token: &ShareToken, now: i64) -> CommonRpcError {
    let rows = match sql
        .all(&Statement::new(
            "SELECT expires_at, revoked_at FROM share_link WHERE token = ?",
            vec![Param::text(token.as_str())],
        ))
        .await
    {
        Ok(rows) => rows,
        Err(cause) => return storage(cause),
    };

    let Some(found) = rows.first() else {
        return not_found("share");
    };
    if row::read_opt_int(found, "revoked_at").flatten().is_some() {
        return not_found("share");
    }
    match row::read_opt_int(found, "expires_at").flatten() {
        Some(expires_at) if expires_at <= now => not_found("share_expired"),
        _ => not_found("share"),
    }
}

/// 共有リンクを開く。**サインインは要らない**（リンクを知っていることが鍵）。
///
/// 期限切れ・取り消し済みは SQL の条件に畳んである。読み出してから
/// アプリ側で判定すると、判定を忘れた経路がそのまま漏洩になる。
pub async fn resolve<S: Sql>(
    sql: &S,
    request: &ManageRequest<'_>,
) -> Result<Value, CommonRpcError> {
    let token: ShareToken = input::parse_token(request.body)?;

    let columns = CODE_COLUMNS
        .split(", ")
        .map(|column| format!("c.{column}"))
        .collect::<Vec<_>>()
        .join(", ");

    let rows = sql
        .all(&Statement::new(
            format!(
                "SELECT s.permission AS permission, {columns} FROM share_link s \
                 JOIN code c ON c.id = s.code_id \
                 WHERE s.token = ? AND s.revoked_at IS NULL \
                 AND (s.expires_at IS NULL OR s.expires_at > ?)"
            ),
            vec![Param::text(token.as_str()), Param::Int(request.now)],
        ))
        .await
        .map_err(storage)?;

    let Some(found) = rows.first() else {
        return Err(explain_absence(sql, &token, request.now).await);
    };
    let code = row::to_code(found).ok_or(CommonRpcError::Internal)?;
    let permission = row::read_text(found, "permission").ok_or(CommonRpcError::Internal)?;

    Ok(json!({ "permission": permission, "code": code }))
}
