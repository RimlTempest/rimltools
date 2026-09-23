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
mod trace;

use qrcc_kernel::RpcDecodeError;
use qrcc_kernel::rpc::{encode_envelope, header};
use worker::{Context, Date, Env, Request, Response, Result, console_log, event};

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    let http_method = req.method().to_string();
    let actor = req.headers().get(header::ACTOR).ok().flatten();
    let request_id = req.headers().get(header::REQUEST_ID).ok().flatten();
    let idempotency_key = req.headers().get(header::IDEMPOTENCY_KEY).ok().flatten();
    // 上流（qrcc-web）がテレメトリを有効にしているときだけ、trace_id 付きで 1 行残す
    let traceparent = req.headers().get("traceparent").ok().flatten();
    if let Some(trace_id) = traceparent.as_deref().and_then(trace::trace_id) {
        console_log!(
            "{}",
            trace::rpc_log_line(trace_id, request_id.as_deref(), &http_method, &path)
        );
    }
    let body = req.bytes().await.unwrap_or_default();

    let built = request::build(
        &http_method,
        &path,
        actor.as_deref(),
        request_id.as_deref(),
        &body,
    );

    let rpc_request = match built {
        Ok(rpc_request) => rpc_request.with_idempotency_key(idempotency_key.as_deref()),
        // トランスポート層の失敗だけが 200 以外になる。
        Err(cause) => return Response::error(cause.to_string(), cause.status()),
    };

    // 時計はここで 1 度だけ読む。下の層は現在時刻を引数で受け取るので、
    // 判断がすべて単体テストできる（作成日時も期限の判定も再現できる）。
    let now = (Date::now().as_millis() / 1000) as i64;
    let outcome = dispatch::dispatch_stored(&rpc_request, &env, now).await;
    let envelope = encode_envelope(&outcome).map_err(|cause| {
        worker::Error::RustError(
            RpcDecodeError::MalformedValue {
                detail: cause.to_string(),
            }
            .to_string(),
        )
    })?;

    Response::from_json(&envelope)
}
