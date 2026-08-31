//! qrcc-api — auxiliary Worker（ADR-0002）。
//!
//! この Worker は **ルートを持たない**。到達経路は qrcc-web からの
//! service binding のみで、認証は呼び出し側が済ませている。
//! `wrangler.jsonc` に `routes` を追加してはならない（CI の guard が検査する）。
#![forbid(unsafe_code)]

use worker::{Context, Env, Request, Response, Result, event};

#[event(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    // TODO(feat/api-worker): docs/api-contract.md の POST /rpc/<method> を実装する。
    Response::error(format!("not implemented: {}", req.path()), 501)
}
