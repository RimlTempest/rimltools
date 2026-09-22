# qrcc-web のバンドル

qrcc-web（Worker）のサーバ側バンドルの内訳と、予算（`bundle-budget.json`）の根拠。
Workers Free の上限は 1 Worker あたり 3 MiB（gzip）。上限に近づくと機能を足せなくなるので、
内訳を把握して「サーバで使っていないのに入っているもの」を外す。

wasm の予算（ADR-0003: ブラウザの生成 gzip 200 KB / デコード gzip 800 KB、Worker の wasm 3 MB）は
`scripts/check-bundle.sh` が別に検査する。ここで扱うのは **qrcc-web の Worker に載る JS と wasm の合計**。

## 計測のしかた

```bash
cd products/qrcc
QRCC_BUNDLE_ANALYZE=1 bun run build          # sourcemap を出す（本番のビルドには出さない）
bun ../../scripts/bundle-budget.ts .         # 予算に対する合計と、大きいファイル
bun ../../scripts/bundle-report.ts apps/web/dist/server 20   # JS をパッケージ別に按分（wasm は含まない）
```

`bundle-report.ts` は sourcemap の文字数比で gzip サイズを按分した**推定値**。

## 2026-09 の削減

本番と同じビルド（sourcemap 無し）で測った値。内訳の表は sourcemap 付きのビルドで測っているので、合計が数 KiB 大きい。

|        | サーバ（JS + wasm、gzip） | うち wasm | 上限 3 MiB に対して | クライアント JS（gzip） |
| ------ | ------------------------: | --------: | ------------------: | ----------------------: |
| 変更前 |               1,568.0 KiB | 876.8 KiB |                 51% |               237.55 kB |
| 変更後 |                 686.1 KiB |         0 |                 22% |   237.55 kB（変化なし） |

主要 7 ページ（`/`、`/print`、`/nfc`、`/codes`、`/settings`、`/sign-in`、`/shared/<token>`）の SSR の HTML は、
アセットのハッシュ名を揃えると、ルーターが埋め込むリクエスト時刻（`u:`）以外は同じだった。先読みするアセットの一覧も同じ。

**原因**: `@qrcc/wasm` の `loadBrowserWasm` / `loadBrowserDecoder` が wasm-pack の出力を動的 import していた。
呼び出し側は `canUseBrowserWasm()` を確かめてからブラウザでしか呼ばないが、import の文そのものは SSR の
ビルドにも残るので、ブラウザ用のエンジン 2 つ（デコード 778.7 KiB、生成 98.1 KiB、gzip）が Worker に同梱されていた。

**対処**: `import.meta.env.SSR`（ビルド時の定数）で分岐し、サーバ側では import ごと消す。万一サーバで
呼ばれた場合は拒否された Promise を返し、`makeWasmRenderer` / `makeWasmDecoder` が `wasm_unavailable` にする
（呼び出し側の扱いは変わらない）。ブラウザに配信する wasm は変わらない（`dist/client` にそのまま残る）。

noter の Mermaid / CodeMirror と同じ型の問題（`products/noter/docs/bundle.md`）。

## 変更後の内訳（JS、上位 20）

合計 687.7 KiB gzip（53 チャンク）。

| #   | パッケージ / ディレクトリ      | 推定 gzip (KiB) |  割合 | 主なチャンク                         | サーバに入る経路                           |
| --- | ------------------------------ | --------------: | ----: | ------------------------------------ | ------------------------------------------ |
| 1   | `(unmapped)`                   |           149.0 | 21.7% | `assets/sql`, `index.js`             | bundler の生成コード・sourcemap の無い依存 |
| 2   | `react-dom`                    |            80.4 | 11.7% | `index.js`                           | SSR（`react-dom/server`）。必要            |
| 3   | `better-auth`                  |            65.7 |  9.6% | `assets/sql`, `assets/sign-in.route` | `features/auth/server/auth.ts`             |
| 4   | `kysely`                       |            57.3 |  8.3% | `assets/sql`                         | better-auth 本体の既定アダプタ             |
| 5   | `@better-auth/core`            |            51.6 |  7.5% | `assets/sql`, `assets/factory`       | better-auth                                |
| 6   | `@tanstack/router-core`        |            34.6 |  5.0% | `assets/Match`, `index.js`           | ルーター。必要                             |
| 7   | `zod`                          |            32.7 |  4.8% | `assets/sql`                         | better-auth の入力検証                     |
| 8   | `(app) features/manage`        |            22.7 |  3.3% | `assets/ui`, `assets/server`         | 管理画面の SSR と server function          |
| 9   | `drizzle-orm`                  |            22.0 |  3.2% | `assets/sql`                         | `features/auth` の drizzle アダプタ        |
| 10  | `seroval`                      |            17.1 |  2.5% | `index.js`                           | TanStack Start のシリアライザ。必要        |
| 11  | `jose`                         |            15.3 |  2.2% | `assets/sql`                         | better-auth（JWT）                         |
| 12  | `(app) features/generate`      |            14.3 |  2.1% | `assets/ui`, `assets/contract`       | 生成画面の SSR                             |
| 13  | `(app) features/scan`          |            11.9 |  1.7% | `assets/home.route`                  | 読み取り画面の SSR                         |
| 14  | `@tanstack/start-server-core`  |             9.7 |  1.4% | `index.js`                           | 必要                                       |
| 15  | `@tanstack/react-router`       |             9.6 |  1.4% | `assets/router`, `assets/Match`      | 必要                                       |
| 16  | `@better-auth/kysely-adapter`  |             9.0 |  1.3% | `assets/sql`                         | better-auth 本体                           |
| 17  | `(app) features/print`         |             6.7 |  1.0% | `assets/print.route`                 | 印刷画面の SSR                             |
| 18  | `better-call`                  |             6.6 |  1.0% | `assets/sql`                         | better-auth                                |
| 19  | `(app) packages/telemetry`     |             5.3 |  0.8% | `assets/worker`                      | 計装（`@rimltools/telemetry`）。必要       |
| 20  | `@better-auth/drizzle-adapter` |             5.1 |  0.7% | `assets/sql`                         | `features/auth` の drizzle アダプタ        |

## 残っている削減の余地

認証まわり（better-auth・kysely・drizzle・zod・jose、合計でおよそ 230 KiB）が JS の約 3 分の 1 を占める。
drizzle アダプタ（qrcc が選んでいる）と kysely アダプタ（better-auth 本体の既定）が**両方入っている**のは重複の疑いがある。
`features/auth` は better-auth の版をそろえる作業と共通化（`packages/auth`）の最中なので、その後に見直す。

## 予算

`bundle-budget.json` の `maxGzipBytes` は **1 MiB**（上限 3 MiB の 3 分の 1）。

- 実測 686 KiB から約 338 KiB の伸びしろ
- ブラウザ用 wasm が SSR のビルドに戻ると 1.5 MiB を超えるので、この予算で CI が止まる
- noter は 1.5 MiB（実測 869 KiB）。qrcc は wasm という「戻ると一気に増えるもの」があるので、より狭くしている
