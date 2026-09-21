//! HTTP から RPC 呼び出しを組み立てる純粋な部分。
//!
//! `worker::Request` から取り出した素材（メソッド・パス・ヘッダ・本文）だけを
//! 受け取り、I/O を持たない。おかげで Worker を起動せずに単体テストできる。

use qrcc_kernel::rpc::header;
use qrcc_kernel::{CommonRpcError, UserId};
use serde_json::Value;

/// 本文の上限（docs/api-contract.md）。サーバ側デコードの入力上限でもある。
pub const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

const RPC_PATH_PREFIX: &str = "/rpc/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RpcRequest {
    pub method: String,
    /// qrcc-web が検証済みの呼び出し元。匿名なら `None`。
    pub actor: Option<UserId>,
    pub request_id: Option<String>,
    /// 作成系メソッドの二重実行を防ぐ鍵（docs/api-contract.md 5 節）。
    pub idempotency_key: Option<String>,
    pub body: Value,
}

impl RpcRequest {
    /// `Idempotency-Key` を後付けする。
    ///
    /// `build` の引数に足さないのは、この鍵を見るのが作成系メソッドだけで、
    /// 残りの経路には無関係だから。空文字は「付いていない」と同じに扱う
    /// （空の鍵で全ての作成が同一視されると、作成が 1 回しかできなくなる）。
    pub fn with_idempotency_key(mut self, key: Option<&str>) -> Self {
        self.idempotency_key = key.filter(|key| !key.is_empty()).map(str::to_owned);
        self
    }
}

/// 受け付けられない要求。`status` はトランスポート層の応答コードに使う。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RequestError {
    #[error("only POST is allowed on /rpc/*")]
    MethodNotAllowed,
    #[error("not an rpc path")]
    NotRpcPath,
    #[error("invalid {header} header", header = header::ACTOR)]
    InvalidActor,
    #[error("body is {actual} bytes, limit is {max}")]
    BodyTooLarge { max: usize, actual: usize },
    #[error("body must be JSON: {0}")]
    MalformedBody(String),
}

impl RequestError {
    pub fn status(&self) -> u16 {
        match self {
            Self::MethodNotAllowed => 405,
            Self::NotRpcPath => 404,
            Self::InvalidActor => 400,
            Self::BodyTooLarge { .. } => 413,
            Self::MalformedBody(_) => 400,
        }
    }
}

/// 呼び出し元ヘッダを読む。
///
/// 値が壊れている場合に「匿名として通す」ことは**しない**。
/// qrcc-web 以外から到達しない前提が崩れたことを意味するため、要求ごと拒否する。
pub fn parse_actor(raw: Option<&str>) -> Result<Option<UserId>, RequestError> {
    match raw {
        None => Ok(None),
        Some(value) => UserId::parse(value)
            .map(Some)
            .map_err(|_| RequestError::InvalidActor),
    }
}

/// `/rpc/<method>` からメソッド名を取り出す。
pub fn parse_method(path: &str) -> Result<&str, RequestError> {
    let method = path
        .strip_prefix(RPC_PATH_PREFIX)
        .ok_or(RequestError::NotRpcPath)?;
    if method.is_empty() || method.contains('/') {
        return Err(RequestError::NotRpcPath);
    }
    Ok(method)
}

/// 素材から RPC 要求を組み立てる。
pub fn build(
    http_method: &str,
    path: &str,
    actor_header: Option<&str>,
    request_id_header: Option<&str>,
    body: &[u8],
) -> Result<RpcRequest, RequestError> {
    let method = parse_method(path)?;
    if !http_method.eq_ignore_ascii_case("POST") {
        return Err(RequestError::MethodNotAllowed);
    }
    if body.len() > MAX_BODY_BYTES {
        return Err(RequestError::BodyTooLarge {
            max: MAX_BODY_BYTES,
            actual: body.len(),
        });
    }
    let parsed = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(body)
            .map_err(|cause| RequestError::MalformedBody(cause.to_string()))?
    };

    Ok(RpcRequest {
        method: method.to_owned(),
        actor: parse_actor(actor_header)?,
        request_id: request_id_header.map(str::to_owned),
        idempotency_key: None,
        body: parsed,
    })
}

/// 認証が要るメソッドで呼び出し元を取り出す。
pub fn require_actor(request: &RpcRequest) -> Result<&UserId, CommonRpcError> {
    request.actor.as_ref().ok_or(CommonRpcError::Unauthorized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ACTOR: &str = "usr_0123456789abcdefghjkmnpq";

    #[test]
    fn extracts_the_method_from_the_path() {
        assert_eq!(parse_method("/rpc/render"), Ok("render"));
        assert_eq!(parse_method("/rpc/codes.list"), Ok("codes.list"));
    }

    #[test]
    fn rejects_paths_that_are_not_a_single_rpc_method() {
        for path in ["/", "/rpc", "/rpc/", "/rpc/a/b", "/health"] {
            assert_eq!(
                parse_method(path),
                Err(RequestError::NotRpcPath),
                "path: {path}"
            );
        }
    }

    #[test]
    fn accepts_only_post() {
        let built = build("GET", "/rpc/render", None, None, b"{}");
        assert_eq!(built, Err(RequestError::MethodNotAllowed));
        assert!(build("post", "/rpc/render", None, None, b"{}").is_ok());
    }

    #[test]
    fn treats_a_missing_actor_as_anonymous() {
        let request = build("POST", "/rpc/render", None, None, b"{}").expect("must build");
        assert_eq!(request.actor, None);
    }

    #[test]
    fn accepts_a_well_formed_actor() {
        let request = build("POST", "/rpc/render", Some(ACTOR), None, b"{}").expect("must build");
        assert_eq!(
            request.actor.map(|id| id.as_str().to_owned()),
            Some(ACTOR.to_owned())
        );
    }

    /// 壊れた actor を匿名扱いで通すと、権限のない呼び出しが素通りする。
    #[test]
    fn refuses_a_malformed_actor_instead_of_falling_back_to_anonymous() {
        for bad in ["", "usr_short", "cd_0123456789abcdefghjkmnpq", "not-an-id"] {
            let built = build("POST", "/rpc/render", Some(bad), None, b"{}");
            assert_eq!(built, Err(RequestError::InvalidActor), "actor: {bad:?}");
        }
    }

    #[test]
    fn parses_the_json_body() {
        let request = build("POST", "/rpc/render", None, None, br#"{"a":1}"#).expect("must build");
        assert_eq!(request.body, json!({ "a": 1 }));
    }

    #[test]
    fn treats_an_empty_body_as_null() {
        let request = build("POST", "/rpc/render", None, None, b"").expect("must build");
        assert_eq!(request.body, Value::Null);
    }

    #[test]
    fn rejects_a_body_that_is_not_json() {
        let built = build("POST", "/rpc/render", None, None, b"not json");
        assert!(matches!(built, Err(RequestError::MalformedBody(_))));
    }

    #[test]
    fn rejects_a_body_over_the_limit() {
        let body = vec![b'x'; MAX_BODY_BYTES + 1];
        let built = build("POST", "/rpc/render", None, None, &body);
        assert_eq!(
            built,
            Err(RequestError::BodyTooLarge {
                max: MAX_BODY_BYTES,
                actual: MAX_BODY_BYTES + 1
            })
        );
    }

    #[test]
    fn maps_each_failure_to_a_transport_status() {
        assert_eq!(RequestError::MethodNotAllowed.status(), 405);
        assert_eq!(RequestError::NotRpcPath.status(), 404);
        assert_eq!(RequestError::InvalidActor.status(), 400);
        assert_eq!(
            RequestError::BodyTooLarge { max: 1, actual: 2 }.status(),
            413
        );
        assert_eq!(RequestError::MalformedBody("x".into()).status(), 400);
    }

    #[test]
    fn carries_an_idempotency_key_when_one_is_sent() {
        let request = build("POST", "/rpc/codes.create", Some(ACTOR), None, b"{}")
            .expect("must build")
            .with_idempotency_key(Some("key-1"));
        assert_eq!(request.idempotency_key, Some("key-1".to_owned()));
    }

    /// 空の鍵で全ての作成が同一視されると、2 件目が永遠に作れなくなる。
    #[test]
    fn treats_a_missing_or_empty_idempotency_key_as_absent() {
        let request = build("POST", "/rpc/codes.create", None, None, b"{}").expect("must build");
        assert_eq!(
            request.clone().with_idempotency_key(None).idempotency_key,
            None
        );
        assert_eq!(request.with_idempotency_key(Some("")).idempotency_key, None);
    }

    #[test]
    fn require_actor_rejects_anonymous_callers() {
        let anonymous = build("POST", "/rpc/codes.list", None, None, b"{}").expect("must build");
        assert_eq!(require_actor(&anonymous), Err(CommonRpcError::Unauthorized));

        let signed_in =
            build("POST", "/rpc/codes.list", Some(ACTOR), None, b"{}").expect("must build");
        assert!(require_actor(&signed_in).is_ok());
    }
}
