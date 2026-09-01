//! qrcc-generate — QR コードとバーコードの生成。
//!
//! 責務は「仕様 → モジュール配置 → 描画」。I/O を持たず、`worker` crate にも
//! 依存しないので、Worker とブラウザ wasm の両方で同じコードが動く（ADR-0003）。
#![forbid(unsafe_code)]
#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used, clippy::panic))]

pub mod matrix;
pub mod output;
pub mod payload;
pub mod render;
pub mod style;
pub mod symbology;

pub use matrix::Modules;
pub use payload::{CodePayload, WifiAuth};
pub use render::{OutputFormat, RenderError, RenderRequest, RenderResponse, RenderWarning, render};
pub use style::{ModuleShape, Paint, RenderStyle, contrast_ratio};
pub use symbology::{Code128Charset, EncodeError, QrEc, Symbology};
