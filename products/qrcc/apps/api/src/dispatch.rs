//! メソッド名からハンドラへの振り分け。
//!
//! 新しいメソッドを足すときは、ここに 1 アームと、対応する feature の
//! 呼び出しを足す。振り分けを 1 箇所に集めているので、
//! 「どのメソッドが存在するか」がこのファイルだけで分かる。
//!
//! 失敗は JSON で運ぶ。共通エラー（`CommonRpcError`）と feature 固有のエラーが
//! 混在するため、振り分け層では型を 1 つに畳まず、封筒に載る形にして返す。

use qrcc_kernel::CommonRpcError;
use qrcc_manage_worker::{D1Store, ManageRequest};
use serde::Serialize;
use serde_json::{Value, json};
use worker::Env;

use crate::request::{RpcRequest, require_actor};

/// 成否どちらも封筒に載る JSON。
pub type DispatchResult = Result<Value, Value>;

fn to_error<E: Serialize>(error: &E) -> Value {
    serde_json::to_value(error)
        .unwrap_or_else(|cause| json!({ "kind": "internal", "detail": cause.to_string() }))
}

fn common(error: CommonRpcError) -> Value {
    to_error(&error)
}

pub fn dispatch(request: &RpcRequest) -> DispatchResult {
    match request.method.as_str() {
        "health" => Ok(json!({ "status": "ok" })),
        // 呼び出し元の伝搬（ADR-0002: 認可は qrcc-web が行い、検証済みの
        // UserId をヘッダで渡す）が実際に効いているかを確かめるための診断。
        "whoami" => require_actor(request)
            .map(|actor| json!({ "userId": actor.as_str() }))
            .map_err(common),
        "render" => render(request),
        // TODO(feat/scan): decode
        // TODO(feat/print): print
        // codes.* / folders.* / shares.* は D1 が要るので `dispatch_stored` 側にある
        unknown => Err(common(CommonRpcError::NotFound {
            resource: alloc_method(unknown),
        })),
    }
}

/// D1 を要するメソッドを含む、Worker からの唯一の入口。
///
/// 純粋な `dispatch` を内側に残しているのは、計算だけのメソッドを
/// 同期・I/O なしのまま単体テストできる形に保つため。
/// 保存系の判断は `qrcc-manage-worker` 側にあり、そちらも
/// フェイクの `Sql` で単体テストできる（ADR-0002 / ADR-0007）。
pub async fn dispatch_stored(request: &RpcRequest, env: &Env, now: i64) -> DispatchResult {
    if !qrcc_manage_worker::handles(&request.method) {
        return dispatch(request);
    }
    let Ok(db) = env.d1("DB") else {
        return Err(common(CommonRpcError::Internal));
    };
    let store = D1Store::new(db);
    let outcome = qrcc_manage_worker::handle(
        &store,
        &ManageRequest {
            method: &request.method,
            actor: request.actor.as_ref(),
            idempotency_key: request.idempotency_key.as_deref(),
            body: &request.body,
            now,
        },
    )
    .await;
    outcome.map_err(|error| to_error(&error))
}

fn render(request: &RpcRequest) -> DispatchResult {
    let parsed: qrcc_generate::RenderRequest = serde_json::from_value(request.body.clone())
        .map_err(|cause| {
            json!({ "kind": "invalid_option", "field": "body", "reason": cause.to_string() })
        })?;

    let response = qrcc_generate::render(&parsed).map_err(|error| to_error(&error))?;
    serde_json::to_value(&response).map_err(|_| common(CommonRpcError::Internal))
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

    fn request_with_body(method: &str, body: &str) -> RpcRequest {
        build(
            "POST",
            &format!("/rpc/{method}"),
            None,
            None,
            body.as_bytes(),
        )
        .expect("must build")
    }

    #[test]
    fn health_reports_ok() {
        assert_eq!(dispatch(&request("health")), Ok(json!({ "status": "ok" })));
    }

    #[test]
    fn whoami_requires_a_caller() {
        assert_eq!(
            dispatch(&request("whoami")),
            Err(json!({ "kind": "unauthorized" }))
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
        assert_eq!(
            dispatch(&request("nope")),
            Err(json!({ "kind": "not_found", "resource": "method nope" }))
        );
    }

    /// 保存系は D1 が要るので、純粋な `dispatch` は引き受けない。
    /// どちらが引き受けるかの境界を、一覧そのもので確かめる。
    #[test]
    fn stateful_methods_are_left_to_the_stored_dispatch() {
        for method in qrcc_manage_worker::METHODS {
            assert!(qrcc_manage_worker::handles(method), "method: {method}");
            assert_eq!(
                dispatch(&request(method)),
                Err(json!({ "kind": "not_found", "resource": format!("method {method}") })),
                "method: {method}"
            );
        }
        assert!(!qrcc_manage_worker::handles("render"));
    }

    #[test]
    fn render_produces_an_svg_for_a_valid_request() {
        let body = r##"{
            "payload": { "kind": "url", "url": "https://qrcc.riml4i.com" },
            "symbology": { "kind": "qr", "ec": "M" },
            "style": {
                "foreground": "#000000",
                "background": { "kind": "solid", "color": "#ffffff" },
                "scale": 4, "quiet_zone": null, "module_shape": "square",
                "bar_height": 40, "human_readable": true
            },
            "output": "svg"
        }"##;
        let response = dispatch(&request_with_body("render", body)).expect("renders");
        let svg = response["body"].as_str().unwrap_or_default();
        assert!(svg.starts_with("<svg"));
        assert_eq!(response["content_type"], "image/svg+xml");
        assert_eq!(response["description"], "URL: https://qrcc.riml4i.com");
    }

    #[test]
    fn render_reports_a_malformed_request_body() {
        let error =
            dispatch(&request_with_body("render", r#"{"payload":1}"#)).expect_err("invalid");
        assert_eq!(error["kind"], "invalid_option");
    }
}
