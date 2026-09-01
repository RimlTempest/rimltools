//! qrcc-scan — 画像から QR / バーコードを読む（rxing）。
//!
//! 責務は「画像バイト列 → 検出結果」。I/O を持たず、`worker` crate にも
//! 依存しないので、Worker とブラウザ wasm の両方で同じコードが動く（ADR-0003）。
//!
//! 読み取りをブラウザで完結させると、画像をサーバに送らずに済み、
//! Workers のリクエスト無料枠も消費しない（docs/free-tier-budget.md）。
#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::expect_used,
        clippy::unwrap_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

pub mod decode;
pub mod symbology;

#[cfg(test)]
mod testing;

pub use decode::{
    Corner, DecodeError, DecodeHints, DecodeResponse, Detection, MAX_IMAGE_DIMENSION, decode,
};
pub use symbology::ScanSymbology;
