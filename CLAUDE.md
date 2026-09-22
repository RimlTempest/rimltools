# rimltools

小さな Web ツール群（RimlTools）の monorepo。入口は `https://tools.riml4i.com`。
各ツールは独立した Cloudflare Worker としてサブドメインで公開する。

| ツール | 場所          | 内容                                          |
| ------ | ------------- | --------------------------------------------- |
| qrcc   | `apps/qrcc/`  | QR・バーコードの生成 / 読み取り / 管理 / 印刷 |
| noter  | `apps/noter/` | リアルタイム共同編集エディタ                  |

## 作業を始める前に

**触るプロダクトの `apps/<name>/CLAUDE.md` を必ず読むこと。** 設計ルール・ADR は
プロダクトごとに持っている。プロダクトをまたぐ変更（ルートの設定・CI）はこのファイルの規約に従う。

スキルは 2 か所にある。プロダクト配下で作業していても、リポジトリ直下の `.claude/skills` は読める。

| 置き場所                                 | 中身                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/skills/`（→ `.agents/skills/`） | 全プロダクト共通: `rimltools-typescript` / `rimltools-html-a11y` / `rimltools-tdd` / `rimltools-worktree` と、外部から取り込んだ skill（`skills-lock.json`） |
| `apps/<name>/.claude/skills/`            | プロダクト固有: `<name>-architecture`（構成・拡張レシピ）/ `<name>-conventions`（共通規約との差分）                                                          |

共通の規約とプロダクト固有の差分は必ず両方読む。食い違ったらプロダクト固有を優先する。

## 絶対に守ること

- **プロダクト同士は互いの内部を import しない。** 共有したいものが出てきたら
  ルートに `packages/<name>` を作って両方から依存する。
- **Workers Free プランに留まる。R2 も KV も使わない。** 上限はアカウント単位なので、
  ツールが増えるほど 100k req/日 を分け合う。新しいツールも生成・処理は既定でブラウザ側。
- 各プロダクトの `bun run check` / `bun run test` はプロダクト直下で動く
  （oxlint / oxfmt / markuplint の設定はプロダクトごと）。

## コマンド（ルートから）

```bash
bun install                 # 依存はルートの bun.lock 1 つで管理する
bun run check               # 全プロダクトの check
bun run test                # 全プロダクトの test
bun run dev:qrcc            # qrcc の開発サーバ → https://qrcc.rimltools.localhost（portless）
bun run dev:noter           # noter の開発サーバ → https://noter.rimltools.localhost
bun run dev:portal          # portal → https://portal.rimltools.localhost
bun run --cwd apps/qrcc <script>   # 個別のスクリプト
```

新しい環境では `mise install && bun install`（`prepare` で lefthook も入る）。

## ローカルの URL（portless）

詳細は `docs/local-dev.md`。skill `portless` / `oauth` も参照。

- **ローカルの URL は portless の名前（`https://<tool>.rimltools.localhost`）を使う。ポート番号を
  コード・設定・テスト以外のドキュメントに書かない・ハードコードしない。** 名前は `portless.json` が決める。
  スクリプトから URL が要るなら `portless get <name>` か `PORTLESS_URL` を読む。
- dev サーバはポートを自分で決めない。`PORT` / `HOST` に従う（`@rimltools/devtools`）。
  Worker にブラウザの https のオリジンを伝えるのは `DEV_PUBLIC_ORIGIN`（dev サーバのときだけ）。
- 例外は 2 つだけ: Google ログイン用の `tools.json` の `fixedDevPort`（Google が `*.localhost` を
  受け付けないため）と、e2e が OS から受け取る空きポート（portless を使わない）。
- **portless のプロキシ起動・CA の信頼・`/etc/hosts` の変更は、端末の設定を変える操作なのでエージェントは
  実行しない。** ユーザーに `docs/local-dev.md` の手順を示す。確認は `bunx portless doctor` / `list` だけ。

## CI / デプロイ

本番の立ち上げ（Terraform のブートストラップから最初のリリースまで）は `docs/bootstrap.md`。

`.github/workflows/<product>-{ci,deploy}.yml`。`paths` で絞っているので、
そのプロダクト（とルートの共通設定）が変わったときだけ走る。
main への push = そのプロダクトの本番デプロイ。

## コミット・PR・レビューの規約（CI が検査する）

詳細は `docs/conventions.md`。

- **コミットメッセージと PR タイトルは Conventional Commits。** scope はプロダクト名から始める。
  PR タイトルがそのままマージコミットの件名になる。
- **レビューコメントは Conventional Comments**（`<label> [(decorations)]: <subject>`）。
  AI のコードレビューも同じ形で書く。`blocking` の指摘が残っている PR はマージしない。

```
feat(qrcc/render): add DataMatrix rectangular sizes
fix(noter/sync): reconnect after offline
ci: split deploy workflows per product

issue (blocking): this throws in the domain layer
suggestion (non-blocking): extract the retry loop into scripts/lib
praise: the red → green commits make this easy to review
```
