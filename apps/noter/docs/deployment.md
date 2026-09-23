# noter のデプロイ

**デプロイは手で行わない。** `main` へのマージで段階リリースが動き、インフラは OpenTofu が管理する。
このページには noter に固有のことだけを書く。手順はルートの docs にある。

| やりたいこと                                   | 見るところ                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 本番に出す・止める・戻す                       | [docs/release.md](../../../docs/release.md)、[docs/runbooks/rollback.md](../../../docs/runbooks/rollback.md) |
| 本番を最初に立ち上げる（D1・ドメイン・secret） | [docs/bootstrap.md](../../../docs/bootstrap.md)                                                              |
| 監視・アラート・SLO                            | [docs/ops/README.md](../../../docs/ops/README.md)                                                            |
| ローカルで動かす                               | ルートの [README.md](../../../README.md)「立ち上げ方法」                                                     |

## 構成

| Worker       | 役割                                                   | 公開                                                                                                                                                                 |
| ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noter-web`  | 画面（SSR）、API、WebSocket（`/ws/:documentId`）の入口 | Custom Domain（OpenTofu が管理）                                                                                                                                     |
| `noter-sync` | 文書ごとの Durable Object（同時編集の中継と永続化）    | **しない**。`routes` も `workers_dev` も書かない。DO には `noter-web` の binding からだけ届く（[ADR-0002](adr/0002-auxiliary-worker-and-private-durable-object.md)） |

- D1 は `noter` の 1 つで、2 つの Worker が共有する。`noter-sync` が D1 に行うのは `document.updated_at` の更新（60 秒に 1 回まで）だけで、読み取りも認可もしない（[ADR-0005](adr/0005-persistence-alarm-coalescing.md)）
- Cloudflare のリソースは D1 と Durable Object（SQLite backed）だけを使う。**R2 と KV は使わない**（[ADR-0009](adr/0009-free-tier-d1-and-do-only.md)）
- Durable Object は必ず `new_sqlite_classes` で宣言する。`new_classes`（KV backed）は Paid 限定で、CI の guard が止める
- リリースは下流の `noter-sync` から先に出す。`noter-web` の DO binding が `noter-sync` を参照するため。`noter-sync` は canary を通さず `wrangler deploy` で一括で出る。DO はオブジェクトごとに同時に 1 版しか動かず、DO の migration は versions upload では当たらないため（[docs/release.md](../../../docs/release.md) §2）
- サーバのバンドル予算は [bundle.md](bundle.md)、無料枠の見積もりは [free-tier-budget.md](free-tier-budget.md)

## secret

| キー                                        | 置き場所    | 用途             |
| ------------------------------------------- | ----------- | ---------------- |
| `BETTER_AUTH_SECRET`                        | `noter-web` | セッションの署名 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `noter-web` | Google ログイン  |

- `noter-sync` に secret は無い
- 本番の値は Worker に入っていて、新しい版に引き継がれる（[docs/release.md](../../../docs/release.md) §6「アプリの secret」）
- staging の値は OpenTofu が用意し、リリースが版と一緒に載せる
- 本番の値は、通常は触らない。差し替えるのは漏洩したときだけ（下の「secret の差し替え」）
- Google の資格情報が無い環境では、Google のボタンを出さずにゲストだけになる。ローカル開発はこの状態で困らない
- Google Cloud Console のリダイレクト URI は `https://<ホスト>/api/auth/callback/google`。登録するホストの一覧は [docs/bootstrap.md](../../../docs/bootstrap.md) §1

### secret の差し替え（漏洩したときだけ）

判断と全体の流れは [docs/runbooks/secret-leak.md](../../../docs/runbooks/secret-leak.md)。値は**必ず標準入力から**渡す。

```bash
printf '%s' "$VALUE" | bunx wrangler secret put BETTER_AUTH_SECRET --name noter-web
```

- `wrangler secret put` は値をプロンプトで尋ねる。非対話の端末で実行すると、**値を入力しないまま成功扱いで登録される**。登録済みの値は API から読み出せないので、空で入ったことに後から気づけない
- `wrangler secret put` は新しい版を作って**すぐに 100% に出す**（段階リリースを通らない）。漏洩への対応でだけ使う
- `BETTER_AUTH_SECRET` を差し替えると、既存のセッションはすべて無効になる（全員ログアウト）

## デプロイ後の確認（smoke）

リリースのワークフローが自動で走らせる。手元からも同じものを流せる。

```bash
bun run smoke                               # 本番（既定）
bun run smoke https://<オリジン>/             # 任意のオリジン
bun run smoke:browser                       # 実ブラウザ（本番）
NOTER_SMOKE_URL=https://<オリジン> bun run smoke:browser
```

> ローカル（portless）のオリジンを叩くときは `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem` を付ける
> （[docs/local-dev.md](../../../docs/local-dev.md)）。

- `smoke`: HTML が参照する `/assets/*` を**全数**取得し、1 本でも 200 以外か空なら失敗する。あわせて `GET /ws/doc_000…` が `426`（Upgrade 無し）を返すことで、WebSocket の経路がつながっていることを確かめる
- `smoke:browser`: JavaScript が動いた結果を見る。ハイドレーション、サインイン画面に「ゲストのまま続ける」が出ること、`/ws/` が 426 を返すこと
- **本番のデータを変えない。** どちらもサインインせず、文書も作らない

smoke が見ないもの（リリース後に人が確かめる）:

- `/sign-in` に「Google でログイン」が出ていること（資格情報は本番にしか無い）
- `https://noter-sync.<account>.workers.dev` が解決しない、または 404 であること（ADR-0002）
- PWA: DevTools → Application で、manifest のアイコンが 4 つ出て、Service Worker が `activated` であること（本番ビルドでだけ登録される）

## デプロイで WebSocket が切れる

版が切り替わると DO のインスタンスが入れ替わり、接続中の WebSocket がすべて切れる。

- クライアントは自動で再接続する（`reconnecting` → `connected`）。切断中の編集は手元に溜めて、再接続後に送るので**失われない**
- 例外: DO が最後の alarm から 5 秒以内に落ち、しかもクライアントが全員閉じていた場合は、その 5 秒ぶんの更新を失う（[realtime-protocol.md](realtime-protocol.md) §4 永続化）

## DO のスキーマを変えるとき

- `features/sync/core/src/schema.ts` の `SCHEMA_VERSION` を上げ、`migrate` に段階を足す。DO の SQLite は起動時に `blockConcurrencyWhile` の中で自動で移行する
- **`SCHEMA_VERSION` を下げない。** 旧コードが新しいスキーマを読めるよう、列の追加だけで済ませる
- **DO クラスの改名・削除は、`migrations` に `renamed_classes` / `deleted_classes` を書く。** 黙って消すと、全文書の状態が消える

## D1 の migration

- リリースが本番の D1 に自動で当てる。手で `--remote` に当てない
- 新旧の版が同時に動くので、**列や表の削除・改名は 2 回のリリースに分ける**（expand → contract。[docs/release.md](../../../docs/release.md) §4）
- ローカル（Miniflare）には `bun run --filter @noter/web db:local` で当てる。e2e は起動時に自動で当てる

## 未実装の運用

- 期限切れゲストと、`deleted_at` から 30 日過ぎた文書の掃除（[ADR-0010](adr/0010-auth-guest-and-google.md) の Cron）。`session.expires_at` と `document.deleted_at` にインデックスは張ってある
- 文書を削除したときの DO の状態の破棄（`/purge` 内部ルート）。削除から 30 日は戻せるようにするため、掃除の Cron と同時に入れる
- 無料枠が逼迫したときの縮退（`PERSIST_DELAY_MS` の引き上げ、新規文書の作成停止）。閾値は [free-tier-budget.md](free-tier-budget.md)

## 経緯

統合前（noter2）は、2026-09-07 に手元の wrangler で本番を立ち上げた（D1 `noter` を APAC に作成、`noter-sync` → `noter-web` の順にデプロイ、secret は標準入力から登録）。2026-09 に RimlTools へ統合し、段階リリース（Workers の versions）と OpenTofu + SOPS に移った。旧手順は使わない。
