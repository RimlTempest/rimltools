//! symbology + payload + style からモジュール行列を作り、SVG / PNG に描画する。
//! worker crate に依存しないこと（ブラウザ向け wasm でも動く）。
#![forbid(unsafe_code)]

// TODO: 実装はレーンの担当。docs/parallel-lanes.md を参照。
