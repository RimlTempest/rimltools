# ADR-0011: React Server Components を当面無効にする

- 状態: 採用（2026-09-22。qrcc ADR-0008・noter ADR-0008 を統合）

## 背景

qrcc で TanStack Start を RSC 有効（`tanstackStart({ rsc: { enabled: true } })` + `@vitejs/plugin-rsc`）にしたところ、
最初の server function（`createServerFn` から service binding 越しに Rust Worker を呼ぶ）が本番ビルドの実行時に 500 になった。

```
POST /_serverFn/… 500
cause: Error: No such module "rsc/assets/@tanstack/router-core/ssr/client"
```

server function の切り出しチャンクが `rsc` 環境の成果物パスを参照するが、そのモジュールがバンドルに存在しない。
`rsc: { enabled: false }` で解消する（切り分け済み）。TanStack Start の RSC は公式に experimental で、
v1 初期まで experimental のまま据え置かれると明記されている。

## 決定

**RSC を有効にしない。** 各プロダクトの `apps/web/vite.config.ts` で `@vitejs/plugin-rsc` を登録せず、
`tanstackStart()` に `rsc` を指定しない。

再検討する条件:

- RSC でしか解けない要件が出たとき（重い依存をサーバに閉じ込めたい、など）
- TanStack Start の RSC が experimental でなくなったとき

## 理由

- **いま RSC を必要としていない。** qrcc の生成・読み取りは端末側の wasm で完結し（qrcc ADR-0003）、
  noter のエディタは完全にクライアント側（CodeMirror + Yjs）で動く。「重い依存をサーバに残す」という RSC の主目的が弱い
- server function は認証・保存・共有（noter は文書 CRUD も）のすべてで使う。**壊れたまま進められない**
- experimental の不具合を回避するための独自パッチを抱えるより、必要になってから再評価するほうが安い（YAGNI）

## 帰結

- SSR とクライアント側ハイドレーションは従来どおり動く。画面の作り方は変わらない
- `cloudflare:*` を常に外部扱いにする Vite 設定は RSC の有無に関わらず要る
  （server function の切り出しチャンクが Cloudflare プラグインの外でも解析されるため）
- `wrangler types` で生成する `worker-configuration.d.ts` が `cloudflare:workers` の型を供給する。
  生成物なので git 管理せず、各プロダクトの `gen` スクリプトが typecheck の前に作る
