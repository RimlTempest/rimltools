---
name: rimltools-worktree
description: RimlTools（qrcc・noter ほか全プロダクト共通）の worktree 並行作業ルール。複数の作業を同時に進めるとき、新しいレーンを始めるとき、rebase が競合したとき、PR を出すときに読む。レーンごとの所有ディレクトリ・依存順・共有ファイルの再生成規約を定義する。「並行で進めたい」「worktree を作る」「コンフリクトした」「どのブランチで作業する」で発火。
---

# worktree 並行作業

レーンはプロダクトごとに定義する。一覧は `products/<tool>/docs/parallel-lanes.md`、
機械可読な定義は `products/<tool>/scripts/lanes.tsv`。
worktree はリポジトリ全体を切り出し、`.claude/worktrees/<tool>/<branch>` に作る
（中のプロダクトは `<worktree>/products/<tool>`）。
プロダクト固有の共有ファイル規約・マージ順は `<tool>-conventions` の `references/worktree.md`。

## 1. 原則

**1 レーン = 1 worktree = 1 ブランチ = 1 PR。**
レーンは「所有ディレクトリ」で分かれている。**自分のレーンが所有していない
ファイルは編集しない。** これがコンフリクトを起こさない唯一の方法。

## 2. コマンド

リポジトリのどこからでも、ツール名を最初の引数に渡す（プロダクト直下なら
`bun run wt <command>` でもそのプロダクトが選ばれる）。

```bash
bun run wt qrcc list               # レーン一覧・依存・現在の worktree
bun run wt qrcc new feat/scan-ui   # worktree 作成（依存インストール・フック設定込み）
cd .claude/worktrees/qrcc/feat-scan-ui/products/qrcc
cat LANE.md                        # 所有ディレクトリと開始前チェック

bun run wt qrcc sync               # develop の更新を rebase で取り込む
bun run check                      # コミット前の全チェック
bun run wt qrcc pr                 # check を通してから PR 作成（base: develop）
bun run wt qrcc status             # 全 worktree の状態
bun run wt qrcc done feat/scan-ui  # マージ後に片付け
```

## 3. 始める前に必ず確認する

1. `products/<tool>/scripts/lanes.tsv` の **depends_on が develop にマージ済みか**
   （`git log --oneline origin/develop` で確認。ブランチ運用はルートの ADR-0002）
2. 先行条件のレーン（qrcc は `feat/shared-contract`、noter は `feat/contracts`。正本は各 lanes.tsv の depends_on が `-` の行）が終わるまで他を始めない
3. `LANE.md` の所有ディレクトリが、やろうとしている作業を含んでいるか
   含んでいないなら、レーンの選択が間違っているか、
   `scripts/lanes.tsv` を直す必要がある（勝手に他所を触らない）

## 4. 共有ファイルは「解決」せず「再生成」する

| ファイル                                            | 競合時の対応                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `bun.lock`（ルートに 1 つ）                         | `git checkout --ours bun.lock && bun install && git add bun.lock` |
| `routeTree.gen.ts` / `worker-configuration.d.ts`    | git 管理外。生成し直すだけ                                        |
| ルート `package.json` / `lefthook.yml` / `.github/` | **プロダクトのレーンからは触らない。** 依存は各ワークスペースに足す |

プロダクト固有の共有ファイル（`Cargo.lock`、`.oxlintrc.json`、wrangler.jsonc、migrations の番号）は
`<tool>-conventions` の `references/worktree.md`。

これ以外が競合したら、**レーンの切り方が間違っている**。
その場で握らず、`docs/parallel-lanes.md` と `scripts/lanes.tsv` を直してから再開する。

## 5. マージ順

レーンの依存グラフはプロダクトごと（`<tool>-conventions` と `products/<tool>/docs/parallel-lanes.md`）。

- **rebase を使う。merge commit を作らない。**
- 依存レーンが develop に入ったら、その日のうちに `bun run wt <tool> sync` する。
  溜めるほど競合の解決コストが上がる。

## 6. 新しいレーンを足す

`products/<tool>/scripts/lanes.tsv` に 1 行足し、`products/<tool>/docs/parallel-lanes.md` の表と依存グラフも
更新してからコミットする（`chore/devops` レーンの担当）。
所有ディレクトリが既存レーンと**重ならない**ことを確認する。

## 7. エージェントに割り当てるとき

各レーンは独立して完了できるように定義されている。
worktree に入ったエージェントには次だけを渡せばよい:

- `LANE.md`（所有ディレクトリ・依存・チェックリスト）
- `products/<tool>/docs/architecture.md` と `docs/domain-model.md`（noter で同期に触るなら `docs/realtime-protocol.md` も）
- 該当スキル（`rimltools-typescript` / `rimltools-html-a11y` / `rimltools-tdd` と、`<tool>-architecture` / `<tool>-conventions`）

**レーンをまたぐ判断が必要になったら止まって相談する**（勝手に他レーンの
ファイルを直さない）。これを守る限り、並行数を増やしても統合は壊れない。
