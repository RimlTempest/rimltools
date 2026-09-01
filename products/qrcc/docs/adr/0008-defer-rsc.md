# ADR-0008: React Server Components を当面無効にする

- 状態: Accepted
- 日付: 2026-09-01
- 関連: [ADR-0001](0001-stack-selection.md)

## 文脈

[ADR-0001](0001-stack-selection.md) では TanStack Start を RSC 有効
（`tanstackStart({ rsc: { enabled: true } })` + `@vitejs/plugin-rsc`）で採用した。
足場を組んだ時点では画面がプレースホルダだけだったため問題は表面化しなかった。

`feat/generate` で最初の server function（`createServerFn` から Rust Worker を
service binding 越しに呼ぶ）を入れたところ、本番ビルドの実行時に 500 になった。

```
POST /_serverFn/… 500
cause: Error: No such module "rsc/assets/@tanstack/router-core/ssr/client"
```

server function を切り出したチャンクが、`rsc` 環境の成果物パスを参照するが、
そのモジュールがバンドルに存在しない。`rsc: { enabled: false }` にすると解消する
（切り分け済み）。

TanStack Start の RSC は公式に experimental で、v1 初期まで experimental の
まま据え置かれる旨が明記されている。

## 決定

**RSC を当面無効にする。** `apps/web/vite.config.ts` から
`@vitejs/plugin-rsc` の登録を外し、`tanstackStart()` の `rsc` 指定も外す。

再検討する条件:

- RSC でしか解けない要件が出たとき（重い依存をサーバに閉じ込めたい、など）
- TanStack Start の RSC が experimental でなくなったとき

## 理由

- **いま RSC を必要としていない。** 生成・読み取りは端末側の wasm で完結させる
  方針（[ADR-0003](0003-rust-core-dual-target.md)）なので、
  「重い依存をサーバに残す」という RSC の主目的が本アプリでは弱い
- server function は認証・保存・共有のすべてで使う。**壊れたまま進められない**
- experimental の不具合を回避するための独自パッチを抱えるより、
  必要になってから再評価するほうが安い（YAGNI）

## 帰結

- `apps/web/vite.config.ts` から RSC 関連の設定が消える。
  `@vitejs/plugin-rsc` は依存に残すが未使用（再開時にすぐ戻せるように）
- SSR とクライアント側ハイドレーションは従来どおり動く。画面の作り方は変わらない
- 併せて、`cloudflare:*` を常に外部扱いにする設定が必要だった
  （server function の切り出しチャンクは Cloudflare プラグインが外部化する
  環境の外でも解析されるため）。これは RSC の有無に関わらず要る
- `wrangler types` で生成する `worker-configuration.d.ts` が
  `cloudflare:workers` の型を供給する。生成物なので git 管理せず、
  `bun run --filter '@qrcc/web' gen` が typecheck の前に作る
