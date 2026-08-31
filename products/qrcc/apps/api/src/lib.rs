//! qrcc-api — auxiliary Worker（ADR-0002）。
//!
//! この Worker は **ルートを持たない**。到達経路は qrcc-web からの
//! service binding のみで、認証は呼び出し側が済ませている。
//! `wrangler.jsonc` に `routes` を追加してはならない（CI の guard が検査する）。
//!
//! 責務はこの薄い層に閉じている:
//!   worker::Request から素材を取り出す → `request::build` → `dispatch` → 封筒
//! 判断はすべて I/O を持たない `request` / `dispatch` 側にあり、単体テストできる。
#![forbid(unsafe_code)]

mod dispatch;
mod request;

use qrcc_kernel::rpc::{encode_envelope, header};
use qrcc_kernel::{CommonRpcError, RpcDecodeError};
use worker::{Context, Env, Request, Response, Result, event};

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(mut req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    let http_method = req.method().to_string();
    let actor = req.headers().get(header::ACTOR).ok().flatten();
    let request_id = req.headers().get(header::REQUEST_ID).ok().flatten();
    let body = req.bytes().await.unwrap_or_default();

    let built = request::build(
        &http_method,
        &path,
        actor.as_deref(),
        request_id.as_deref(),
        &body,
    );

    let rpc_request = match built {
        Ok(rpc_request) => rpc_request,
        // トランスポート層の失敗だけが 200 以外になる。
        Err(cause) => return Response::error(cause.to_string(), cause.status()),
    };

    let outcome = dispatch::dispatch(&rpc_request);
    let envelope = encode_envelope::<_, CommonRpcError>(&outcome).map_err(|cause| {
        worker::Error::RustError(
            RpcDecodeError::MalformedValue {
                detail: cause.to_string(),
            }
            .to_string(),
        )
    })?;

    Response::from_json(&envelope)
}
