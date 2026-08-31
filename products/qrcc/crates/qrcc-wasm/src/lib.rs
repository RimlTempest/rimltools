//! ブラウザ向け wasm-bindgen バインディング（ADR-0003）。
//!
//! 生成とデコードを端末側で実行し、Workers のリクエスト無料枠を消費しない。
//! `decode` は feature で分離し、読み取り画面に入ったときだけ動的 import する。
#![forbid(unsafe_code)]

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// TODO(feat/wasm-bridge): render / decode の JS 向け API を公開する。
