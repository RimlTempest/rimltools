//! 画像から QR / バーコードをデコードする（rxing）。
//! ブラウザ向けビルドではバンドルサイズを抑えるため feature で symbology を絞る。
#![forbid(unsafe_code)]

// TODO: 実装はレーンの担当。docs/parallel-lanes.md を参照。
