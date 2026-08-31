//! PDF 生成とラベル面付け。フォントは呼び出し側が渡す（I/O を持たない）。
//! ADR-0005 のとおりブラウザには配らない。
#![forbid(unsafe_code)]

// TODO: 実装はレーンの担当。docs/parallel-lanes.md を参照。
