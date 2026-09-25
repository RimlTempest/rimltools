# qrcc のデプロイ

**デプロイは手で行わない。** `main` へのマージで段階リリースが動き、インフラは OpenTofu が管理する。
このページには qrcc に固有のことだけを書く。手順はルートの docs にある。

| やりたいこと                                   | 見るところ                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 本番に出す・止める・戻す                       | [docs/release.md](../../../docs/release.md)、[docs/runbooks/rollback.md](../../../docs/runbooks/rollback.md) |
| 本番を最初に立ち上げる（D1・ドメイン・secret） | [docs/bootstrap.md](../../../docs/bootstrap.md)                                                              |
| 監視・アラート・SLO                            | [docs/ops/README.md](../../../docs/ops/README.md)                                                            |
| ローカルで動かす                               | ルートの [README.md](../../../README.md)「立ち上げ方法」                                                     |

## 構成

| Worker     | 役割                               | 公開                                                                                                     |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `qrcc-web` | 画面（SSR）と API の入口           | Custom Domain（OpenTofu が管理）                                                                         |
| `qrcc-api` | 保存・共有などのサーバ処理（Rust） | **しない**。`qrcc-web` の service binding からだけ届く（[ADR-0002](adr/0002-auxiliary-worker-split.md)） |

- D1 は `qrcc` の 1 つで、2 つの Worker が共有する。migration は `services/api/migrations/` にある
- Cloudflare のリソースは D1 だけを使う。**R2 と KV は使わない**（[ADR-0009](adr/0009-stay-on-workers-free.md)）
- リリースは下流の `qrcc-api` から先に出す。`qrcc-api` は外から叩けないので、0% での smoke は省く（[docs/release.md](../../../docs/release.md) §2）
- 生成と読み取りはブラウザの wasm で動く。サーバのバンドル予算は [bundle.md](bundle.md)、無料枠の見積もりは [free-tier-budget.md](free-tier-budget.md)

## secret

| キー                                        | 置き場所   | 用途             |
| ------------------------------------------- | ---------- | ---------------- |
| `BETTER_AUTH_SECRET`                        | `qrcc-web` | セッションの署名 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `qrcc-web` | Google ログイン  |

- 本番の値は Worker に入っていて、新しい版に引き継がれる（[docs/release.md](../../../docs/release.md) §6「アプリの secret」）
- 本番の値は、通常は触らない。差し替えるのは漏洩したときだけ（下の「secret の差し替え」）
- Google の資格情報が無い環境では、Google のボタンを出さずにゲストだけになる。ローカル開発はこの状態で困らない
- Google Cloud Console のリダイレクト URI は `https://<ホスト>/api/auth/callback/google`。登録するホストの一覧は [docs/bootstrap.md](../../../docs/bootstrap.md) §1

### secret の差し替え（漏洩したときだけ）

判断と全体の流れは [docs/runbooks/secret-leak.md](../../../docs/runbooks/secret-leak.md)。値は**必ず標準入力から**渡す。

```bash
printf '%s' "$VALUE" | bunx wrangler secret put BETTER_AUTH_SECRET --name qrcc-web
```

- `wrangler secret put` は値をプロンプトで尋ねる。非対話の端末で実行すると、**値を入力しないまま成功扱いで登録される**。登録済みの値は API から読み出せないので、空で入ったことに後から気づけない
- `wrangler secret put` は新しい版を作って**すぐに 100% に出す**（段階リリースを通らない）。漏洩への対応でだけ使う
- `BETTER_AUTH_SECRET` を差し替えると、既存のセッションはすべて無効になる（全員ログアウト）

## デプロイ後の確認（smoke）

リリースのワークフローが自動で走らせる。手元からも同じものを流せる。

```bash
bun run smoke                              # 本番（既定）
bun run smoke https://<オリジン>/            # 任意のオリジン
bun run smoke:browser                      # 実ブラウザ（本番）
QRCC_SMOKE_URL=https://<オリジン> bun run smoke:browser
```

> ローカル（portless）のオリジンを叩くときは `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem` を付ける
> （[docs/local-dev.md](../../../docs/local-dev.md)）。

- `smoke`: HTML が参照する `/assets/*` を**全数**取得する。1 本でも 200 以外か空なら失敗し、資産が 1 本も見つからないときも失敗する
- `smoke:browser`: JavaScript が動いた結果を見る。ハイドレーション、ブラウザの wasm での生成と読み取り、Google の選択肢、`qrcc-api` に外から届かないこと
- **本番のデータを変えない。** どちらもサインインしない（ゲストの user と session が D1 に増えるため）

全数を確かめるのには理由がある。一度、エントリのチャンクだけが 500 を返し、クライアントの JS が丸ごと動かない状態が本番に残った。HTML は 200 で返り SSR の部分は表示されるので、トップを開くだけでは気づけなかった。

## D1 の migration

- リリースが本番の D1 に自動で当てる。手で `--remote` に当てない
- 新旧の版が同時に動くので、**列や表の削除・改名は 2 回のリリースに分ける**（expand → contract。[docs/release.md](../../../docs/release.md) §4）
- ローカル（Miniflare）には `bun run --filter @qrcc/web db:local` で当てる。e2e は起動時に自動で当てる

## 未実装の運用

- 期限切れゲストの掃除（[ADR-0004](adr/0004-auth-guest-and-google.md) の Cron）。`session.expires_at` にインデックスは張ってある

## 経緯

統合前（qrcc2）は、手元の `wrangler deploy` と `wrangler secret put` で本番に出していた。2026-09 に RimlTools へ統合し、段階リリース（Workers の versions）と OpenTofu + SOPS に移った。旧手順は使わない。
