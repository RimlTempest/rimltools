//! qrcc-web → qrcc-api の RPC 封筒（docs/api-contract.md）。
//!
//! ワイヤ上の形は TS の `Result` と 1:1:
//!   成功: `{ "ok": true,  "value": … }`
//!   失敗: `{ "ok": false, "error": { "kind": "…", … } }`
//!
//! **トランスポートの失敗と業務上の失敗を混同しない。**
//! 前者は外側の `Result`、後者は内側の `Result` で表す。
//! TS 側の実装は `shared/contract/src/rpc.ts`。

extern crate alloc;
use alloc::string::{String, ToString};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// 呼び出し側が付けるヘッダ名。TS の `RPC_HEADER` と同じ値。
pub mod header {
    /// qrcc-web が検証済みの UserId。匿名なら送らない。
    pub const ACTOR: &str = "X-Qrcc-Actor";
    /// ログ相関用。
    pub const REQUEST_ID: &str = "X-Qrcc-Request-Id";
    /// 作成系メソッドの二重実行を防ぐ。
    pub const IDEMPOTENCY_KEY: &str = "Idempotency-Key";
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RpcDecodeError {
    #[error("malformed envelope: {detail}")]
    MalformedEnvelope { detail: String },
    #[error("malformed value: {detail}")]
    MalformedValue { detail: String },
    #[error("malformed error: {detail}")]
    MalformedError { detail: String },
}

/// 共通の業務エラー。feature 固有のエラーは各 feature の contract で定義する。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommonRpcError {
    Unauthorized,
    Forbidden,
    NotFound {
        resource: String,
    },
    LimitExceeded {
        limit: String,
        max: u64,
        actual: u64,
    },
    Internal,
}

/// `Result` を封筒の JSON にする。
pub fn encode_envelope<T, E>(result: &Result<T, E>) -> Result<Value, serde_json::Error>
where
    T: Serialize,
    E: Serialize,
{
    match result {
        Ok(value) => Ok(json!({ "ok": true, "value": serde_json::to_value(value)? })),
        Err(error) => Ok(json!({ "ok": false, "error": serde_json::to_value(error)? })),
    }
}

/// 封筒を読む。
///
/// 外側はトランスポートの成否、内側は業務上の成否。この入れ子は意図的で、
/// 「意味のある返事が届いた」ことと「その返事が成功だった」ことを
/// 呼び出し側に区別させる。
pub fn decode_envelope<T, E>(body: &Value) -> Result<Result<T, E>, RpcDecodeError>
where
    T: DeserializeOwned,
    E: DeserializeOwned,
{
    let Some(object) = body.as_object() else {
        return Err(RpcDecodeError::MalformedEnvelope {
            detail: "expected an object with { ok, value | error }".to_string(),
        });
    };
    let Some(ok) = object.get("ok").and_then(Value::as_bool) else {
        return Err(RpcDecodeError::MalformedEnvelope {
            detail: "\"ok\" must be a boolean".to_string(),
        });
    };

    if ok {
        let Some(value) = object.get("value") else {
            return Err(RpcDecodeError::MalformedEnvelope {
                detail: "a successful envelope must carry \"value\"".to_string(),
            });
        };
        serde_json::from_value(value.clone())
            .map(Ok)
            .map_err(|cause| RpcDecodeError::MalformedValue {
                detail: cause.to_string(),
            })
    } else {
        let Some(error) = object.get("error") else {
            return Err(RpcDecodeError::MalformedEnvelope {
                detail: "a failed envelope must carry \"error\"".to_string(),
            });
        };
        serde_json::from_value(error.clone())
            .map(Err)
            .map_err(|cause| RpcDecodeError::MalformedError {
                detail: cause.to_string(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Payload {
        n: u32,
    }

    #[test]
    fn round_trips_a_successful_envelope() {
        let encoded = encode_envelope::<Payload, CommonRpcError>(&Ok(Payload { n: 1 }))
            .expect("encoding must succeed");
        assert_eq!(encoded, json!({ "ok": true, "value": { "n": 1 } }));
        let decoded: Result<Payload, CommonRpcError> =
            decode_envelope(&encoded).expect("transport must succeed");
        assert_eq!(decoded, Ok(Payload { n: 1 }));
    }

    #[test]
    fn round_trips_a_failed_envelope() {
        let error = CommonRpcError::NotFound {
            resource: "code".to_string(),
        };
        let encoded =
            encode_envelope::<Payload, _>(&Err(error.clone())).expect("encoding must succeed");
        assert_eq!(
            encoded,
            json!({ "ok": false, "error": { "kind": "not_found", "resource": "code" } })
        );
        let decoded: Result<Payload, CommonRpcError> =
            decode_envelope(&encoded).expect("transport must succeed");
        assert_eq!(decoded, Err(error));
    }

    #[test]
    fn rejects_a_malformed_envelope() {
        for body in [
            json!(null),
            json!(42),
            json!("x"),
            json!({}),
            json!({ "ok": "yes" }),
        ] {
            let decoded: Result<Result<Payload, CommonRpcError>, _> = decode_envelope(&body);
            assert!(matches!(
                decoded,
                Err(RpcDecodeError::MalformedEnvelope { .. })
            ));
        }
    }

    #[test]
    fn separates_a_broken_payload_from_a_business_error() {
        let body = json!({ "ok": true, "value": { "n": "no" } });
        let decoded: Result<Result<Payload, CommonRpcError>, _> = decode_envelope(&body);
        assert!(matches!(
            decoded,
            Err(RpcDecodeError::MalformedValue { .. })
        ));
    }

    #[test]
    fn refuses_to_swallow_an_unknown_error_kind() {
        let body = json!({ "ok": false, "error": { "kind": "wat" } });
        let decoded: Result<Result<Payload, CommonRpcError>, _> = decode_envelope(&body);
        assert!(matches!(
            decoded,
            Err(RpcDecodeError::MalformedError { .. })
        ));
    }
}
