# rimltools

小さな Web ツール群（RimlTools）の monorepo。入口は `https://tools.riml4i.com`。
各ツールは独立した Cloudflare Worker としてサブドメインで公開する。

| ツール | 場所              | 内容                                          |
| ------ | ----------------- | --------------------------------------------- |
| qrcc   | `products/qrcc/`  | QR・バーコードの生成 / 読み取り / 管理 / 印刷 |
| noter  | `products/noter/` | リアルタイム共同編集エディタ                  |

## 作業を始める前に

**触るプロダクトの `products/<name>/CLAUDE.md` を必ず読むこと。** 設計ルール・ADR・
スキル（`products/<name>/.claude/skills/`）はプロダクトごとに持っている。
プロダクトをまたぐ変更（ルートの設定・CI）はこのファイルの規約に従う。

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
bun run dev:qrcc            # qrcc の開発サーバ
bun run dev:noter           # noter の開発サーバ
bun run --cwd products/qrcc <script>   # 個別のスクリプト
```

新しい環境では `mise install && bun install`（`prepare` で lefthook も入る）。

## CI / デプロイ

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
