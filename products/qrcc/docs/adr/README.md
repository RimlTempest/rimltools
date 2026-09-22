# Architecture Decision Records

1 決定 = 1 ファイル。決定を変えるときは既存 ADR を書き換えず、
新しい ADR を追加して古い方に `Superseded by ADR-NNNN` を書く。

| #                                      | 決定                                                             | 状態                   |
| -------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| [0001](0001-stack-selection.md)        | TanStack Start (RSC) + Rust + Cloudflare を選ぶ                  | Accepted               |
| [0002](0002-auxiliary-worker-split.md) | Rust バックエンドを auxiliary Worker に分離する                  | Accepted               |
| [0003](0003-rust-core-dual-target.md)  | Rust コアを Worker とブラウザの 2 ターゲットに配る               | Accepted               |
| [0004](0004-auth-guest-and-google.md)  | Better Auth で匿名ゲスト + Google、後からアカウント昇格          | Accepted               |
| [0005](0005-pdf-and-label-printing.md) | ラベル印刷はブラウザ印刷が主、PDF は Rust で生成                 | Accepted               |
| [0006](0006-typescript-7-and-oxc.md)   | TypeScript 7 + oxlint/oxfmt を採用し ESLint/Prettier を使わない  | ルート ADR-0010 に統合 |
| [0007](0007-feature-colocation.md)     | 機能単位の co-location（縦割り）でディレクトリを構成する         | ルート ADR-0012 に統合 |
| [0008](0008-defer-rsc.md)              | React Server Components を当面無効にする                         | ルート ADR-0011 に統合 |
| [0009](0009-stay-on-workers-free.md)   | Workers Free プランに留まり、R2 と KV を使わない                 | Accepted               |
| [0010](0010-webmcp.md)                 | 生成と読み取りを WebMCP のツールとして公開する                   | Accepted               |
| [0011](0011-riml-ds-tokens.md)         | デザイントークンを riml-ds から取る（--qrcc-* は --rd-* の別名） | Accepted               |
| [0012](0012-mado-look.md)              | 窓（Mado）の見た目を riml-ds から取る（色相は qrcc のまま）      | Accepted               |
