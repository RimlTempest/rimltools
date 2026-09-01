//! ブラウザ向け wasm-bindgen バインディング（ADR-0003）。
//!
//! 生成と読み取りを端末側で実行し、Workers のリクエスト無料枠を消費しない。
//! ここは薄い変換層に徹し、判断はすべて `qrcc-generate` / `qrcc-scan` にある。
//!
//! 入出力は **JSON 文字列**。`serde-wasm-bindgen` で構造体を直接渡すより
//! 型の対応表が 1 つ減り、`docs/api-contract.md` の封筒とも同じ形になるため、
//! サーバ経路とクライアント経路で呼び出し側のコードを共通化できる。
#![forbid(unsafe_code)]
// テストではフィクスチャを serde_json の Index で読む。形が違えば落ちるべきなので許可する。
#![cfg_attr(
    test,
    allow(
        clippy::expect_used,
        clippy::unwrap_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

use serde_json::json;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// 封筒に包む。成功も失敗も同じ形で返すので、呼び出し側は 1 つのデコーダで済む。
fn envelope(outcome: Result<serde_json::Value, serde_json::Value>) -> String {
    let value = match outcome {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    value.to_string()
}

fn invalid_request(detail: &str) -> serde_json::Value {
    json!({ "kind": "invalid_option", "field": "request", "reason": detail })
}

/// `RenderRequest` の JSON を受け取り、`docs/api-contract.md` の封筒を返す。
///
/// 失敗しても例外を投げない。JS 側で try/catch を書かせると、
/// 失敗の扱いがサーバ経路と非対称になる。
#[wasm_bindgen]
pub fn render(request_json: &str) -> String {
    let parsed: Result<qrcc_generate::RenderRequest, _> = serde_json::from_str(request_json);
    let request = match parsed {
        Ok(request) => request,
        Err(cause) => return envelope(Err(invalid_request(&cause.to_string()))),
    };

    match qrcc_generate::render(&request) {
        Ok(response) => match serde_json::to_value(&response) {
            Ok(value) => envelope(Ok(value)),
            Err(cause) => envelope(Err(invalid_request(&cause.to_string()))),
        },
        Err(error) => match serde_json::to_value(&error) {
            Ok(value) => envelope(Err(value)),
            Err(cause) => envelope(Err(invalid_request(&cause.to_string()))),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REQUEST: &str = r##"{
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

    fn parse(raw: &str) -> serde_json::Value {
        serde_json::from_str(raw).expect("envelope must be valid JSON")
    }

    #[test]
    fn renders_into_a_successful_envelope() {
        let envelope = parse(&render(REQUEST));
        assert_eq!(envelope["ok"], true);
        assert!(
            envelope["value"]["body"]
                .as_str()
                .unwrap_or_default()
                .starts_with("<svg")
        );
        assert_eq!(
            envelope["value"]["description"],
            "URL: https://qrcc.riml4i.com"
        );
    }

    /// サーバ経路と同じ封筒に載るので、呼び出し側は 1 つのデコーダで済む。
    #[test]
    fn reports_engine_failures_in_the_same_envelope() {
        let long = REQUEST.replace(
            r#"{ "kind": "url", "url": "https://qrcc.riml4i.com" }"#,
            &format!(r#"{{ "kind": "text", "text": "{}" }}"#, "x".repeat(5000)),
        );
        let envelope = parse(&render(&long));
        assert_eq!(envelope["ok"], false);
        assert_eq!(envelope["error"]["kind"], "payload_too_long");
    }

    #[test]
    fn never_panics_on_malformed_input() {
        for bad in ["", "null", "{}", "not json", r#"{"payload":1}"#] {
            let envelope = parse(&render(bad));
            assert_eq!(envelope["ok"], false, "input: {bad:?}");
            assert_eq!(
                envelope["error"]["kind"], "invalid_option",
                "input: {bad:?}"
            );
        }
    }
}
