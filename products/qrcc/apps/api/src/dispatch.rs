//! メソッド名からハンドラへの振り分け。
//!
//! 新しいメソッドを足すときは、ここに 1 アームと、対応する
//! `features/<name>/worker` の呼び出しを足す。振り分けを 1 箇所に集めているので、
//! 「どのメソッドが存在するか」がこのファイルだけで分かる。

use qrcc_kernel::CommonRpcError;
use serde_json::{Value, json};

use crate::request::{RpcRequest, require_actor};

/// 業務上の結果を返す。トランスポート層の失敗はここに来ない。
pub fn dispatch(request: &RpcRequest) -> Result<Value, CommonRpcError> {
    match request.method.as_str() {
        "health" => Ok(json!({ "status": "ok" })),
        // 呼び出し元の伝搬（ADR-0002: 認可は qrcc-web が行い、検証済みの
        // UserId をヘッダで渡す）が実際に効いているかを確かめるための診断。
        "whoami" => require_actor(request).map(|actor| json!({ "userId": actor.as_str() })),
        // TODO(feat/generate): render
        // TODO(feat/scan): decode
        // TODO(feat/print): print
        // TODO(feat/manage): codes.*, folders.*, shares.*
        unknown => Err(CommonRpcError::NotFound {
            resource: alloc_method(unknown),
        }),
    }
}

fn alloc_method(name: &str) -> String {
    let mut resource = String::with_capacity(name.len() + 7);
    resource.push_str("method ");
    resource.push_str(name);
    resource
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::build;

    fn request(method: &str) -> RpcRequest {
        build("POST", &format!("/rpc/{method}"), None, None, b"{}").expect("must build")
    }

    #[test]
    fn health_reports_ok() {
        assert_eq!(dispatch(&request("health")), Ok(json!({ "status": "ok" })));
    }

    #[test]
    fn whoami_requires_a_caller() {
        assert_eq!(
            dispatch(&request("whoami")),
            Err(CommonRpcError::Unauthorized)
        );
    }

    #[test]
    fn whoami_echoes_the_verified_caller() {
        let actor = "usr_0123456789abcdefghjkmnpq";
        let signed_in = build("POST", "/rpc/whoami", Some(actor), None, b"{}").expect("must build");
        assert_eq!(dispatch(&signed_in), Ok(json!({ "userId": actor })));
    }

    #[test]
    fn an_unknown_method_is_not_found_and_names_itself() {
        let result = dispatch(&request("nope"));
        assert_eq!(
            result,
            Err(CommonRpcError::NotFound {
                resource: "method nope".to_owned()
            })
        );
    }
}
