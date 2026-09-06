# ADR-0008: React Server Components を当面無効にする

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0008 を移植 / [ADR-0001](0001-stack.md)

## 文脈

qrcc で TanStack Start の RSC（`rsc: { enabled: true }` + `@vitejs/plugin-rsc`）を
有効にしたところ、server function の切り出しチャンクが `rsc` 環境の成果物を参照して
本番で 500 になった（`No such module "rsc/assets/@tanstack/router-core/ssr/client"`）。
TanStack Start の RSC は experimental で、v1 の間はそのままと明記されている。

noter はエディタが完全にクライアント側（CodeMirror + Yjs）で、RSC で得るものが
qrcc よりさらに少ない。

## 決定

**RSC を有効にしない。** `apps/web/vite.config.ts` に `@vitejs/plugin-rsc` を
登録せず、`tanstackStart()` に `rsc` を指定しない。

再検討する条件:

- RSC でしか解けない要件が出たとき
- TanStack Start の RSC が experimental でなくなったとき

## 理由

- エディタ画面は SSR の後にクライアントが WebSocket を張って初めて意味を持つ。
  サーバでレンダリングする価値があるのはシェルとホーム一覧だけ
- server function は認証・文書 CRUD・共有で使う。壊れたまま進められない

## 帰結

- `cloudflare:*` を常に外部扱いにする Vite 設定は RSC の有無に関わらず要る
  （server function の切り出しチャンクが Cloudflare プラグインの外でも解析されるため）
- `wrangler types` で生成する `worker-configuration.d.ts` が `cloudflare:workers` の
  型を供給する。git 管理せず、`bun run --filter @noter/web gen` が typecheck の前に作る
- `apps/web/src/server.ts` のカスタム server entry（WS 中継）は RSC と無関係に動く
