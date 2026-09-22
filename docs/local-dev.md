# ローカル開発の URL（portless）

ローカルの dev サーバは [portless](https://github.com/vercel-labs/portless) を通して、ポート番号ではなく
名前付きの URL で開く。ツールを同時に起動してもポートがぶつからず、ポートが変わっても URL は変わらない。

| ツール | URL（既定）                          | 起動（リポジトリ直下） |
| ------ | ------------------------------------ | ---------------------- |
| qrcc   | `https://qrcc.rimltools.localhost`   | `bun run dev:qrcc`     |
| noter  | `https://noter.rimltools.localhost`  | `bun run dev:noter`    |
| portal | `https://portal.rimltools.localhost` | `bun run dev:portal`   |

名前はルートの `portless.json` が決める。**URL やポート番号をコード・設定・ドキュメントに書かない。**
必要なら `portless get qrcc.rimltools` で引く。

## 初回だけ

最初の `bun run dev:<tool>` で portless がプロキシを自動で起動する。そのとき次が起きる。

- **443 番で待ち受ける**ために管理者権限を求められる（sudo のパスワード）
- **ローカルの認証局（CA）を作り、OS の信頼ストアに登録する**（ブラウザの警告が出なくなる）
- `/etc/hosts` に名前を書く（Safari が `.localhost` を解決できるように）

どれも端末の設定を変えるので、内容を確かめてから許可する。やり直すときや片付けるときは:

```bash
bunx portless doctor         # 状態を確かめる（変更しない）
bunx portless trust          # CA の登録をやり直す
bunx portless list           # いまの名前と転送先
bunx portless proxy stop     # プロキシを止める
bunx portless clean          # portless の状態・CA の登録・hosts の記述をすべて消す
```

HTTPS を使いたくないときは `PORTLESS_HTTPS=0`（80 番の http。Google ログインと Secure Cookie は動かない）。

## 仕組み（ポートが変わっても壊れない理由）

1. portless がアプリに空きポート（4000〜4999）を `PORT`、待ち受け先を `HOST`、ブラウザから見える URL を
   `PORTLESS_URL` で渡す。
2. qrcc / noter の Vite 設定（`@rimltools/devtools` の `devServerOptions`）が `PORT` / `HOST` で待ち受ける。
   portal は `rimltools-wrangler-dev` が `wrangler dev --port` に渡す。
3. プロキシの後ろの Worker は http でリクエストを受けるので、そのままではブラウザの https のオリジンと
   ずれて、Better Auth のオリジン検査と Cookie が壊れる。そこで Vite の dev サーバのときだけ、
   `PORTLESS_URL` を Worker の `DEV_PUBLIC_ORIGIN` として渡し、認証の baseURL と共有リンクに使う
   （`@rimltools/contract` の `resolvePublicOriginFromEnv`）。受け付けるのは `*.localhost` と
   `*.local.riml4i.com` の https だけ。`vite build` には入らない。

portless を使わずに `bun run --cwd apps/<tool> dev` で起動しても、これまでどおり動く（Vite の既定のポート）。

## Google ログインを試すとき

Google は `*.localhost` のリダイレクト URI を受け付けない（「ホストの TLD は Public Suffix List に
あること」という規則。受け付けるのは `http://localhost:<port>` と、公開の TLD の https）。方法は 2 つ。

**A. portless の TLD を自分のドメインの下にする（おすすめ）**

```bash
export PORTLESS_TLD=local.riml4i.com   # シェルの設定に書く。portless のプロキシ全体に効く
bunx portless proxy stop               # TLD を変えたら一度止める
bun run dev:qrcc                       # → https://qrcc.rimltools.local.riml4i.com
```

Google Cloud Console の OAuth クライアントに、次のリダイレクト URI を足す。

- `https://qrcc.rimltools.local.riml4i.com/api/auth/callback/google`
- `https://noter.rimltools.local.riml4i.com/api/auth/callback/google`

名前は portless が `/etc/hosts` に書くので、公開の DNS レコードは要らない。

**B. portless を使わず固定ポートで起動する（予備）**

```bash
bun run dev:qrcc:oauth    # → http://localhost:5173
bun run dev:noter:oauth   # → http://localhost:5174
```

ポートは `tools.json` の `localOAuthPort`（ツールごとに重複しない）。Google には
`http://localhost:<port>/api/auth/callback/google` を登録する。

## worktree と同時起動

portless は git の worktree を自動で見分け、ブランチ名を名前の前に付ける
（例: `https://fix-ui.qrcc.rimltools.localhost`）。`bun run wt` で作ったレーンから同時に dev を起動しても
名前もポートもぶつからない。設定は要らない。

## ローカルの Grafana LGTM

`ops/local/README.md`。`bun run ops:local:aliases` で Grafana と Faro の受け口に名前を付けると、
`https://grafana.rimltools.localhost` で開ける（Faro も https で送れる。ページが https なので、
http の受け口へ送ると mixed content になるため）。OTLP（Worker からのサーバ間通信）は
`http://127.0.0.1:4318` のまま（Worker のランタイムは portless の CA を信頼しない）。

## portless の外から https の URL を叩くとき

`curl` や `bun` のスクリプト（smoke、ws-probe）は portless の CA を知らない。
`NODE_EXTRA_CA_CERTS=~/.portless/ca.pem` を付けて実行する。

## e2e

Playwright の e2e は portless を使わない。空いているポートを OS から受け取って起動する
（`scripts/lib/e2e-port.ts`）ので、CI でもローカルでも同じように動く。
