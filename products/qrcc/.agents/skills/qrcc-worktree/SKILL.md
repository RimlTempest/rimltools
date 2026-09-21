---
name: qrcc-worktree
description: qrcc2 の worktree 並行作業ルール。複数の作業を同時に進めるとき、新しいレーンを始めるとき、rebase が競合したとき、PR を出すときに読む。レーンごとの所有ディレクトリ・依存順・共有ファイルの再生成規約を定義する。「並行で進めたい」「worktree を作る」「コンフリクトした」「どのブランチで作業する」で発火。
---

# worktree 並行作業

レーン定義の一覧は [docs/parallel-lanes.md](../../../docs/parallel-lanes.md)、
機械可読な定義は `scripts/lanes.tsv`。

## 1. 原則

**1 レーン = 1 worktree = 1 ブランチ = 1 PR。**
レーンは「所有ディレクトリ」で分かれている。**自分のレーンが所有していない
ファイルは編集しない。** これがコンフリクトを起こさない唯一の方法。

## 2. コマンド

```bash
bun run wt list              # レーン一覧・依存・現在の worktree
bun run wt new feat/scan-ui  # worktree 作成（依存インストール・フック設定込み）
cd .claude/worktrees/feat-scan-ui
cat LANE.md                  # 所有ディレクトリと開始前チェック

bun run wt sync              # main の更新を rebase で取り込む
bun run check                # コミット前の全チェック
bun run wt pr                # check を通してから PR 作成
bun run wt status            # 全 worktree の状態
bun run wt done feat/scan-ui # マージ後に片付け
```

## 3. 始める前に必ず確認する

1. `scripts/lanes.tsv` の **depends_on が main にマージ済みか**
   （`git log --oneline origin/main` で確認）
2. `feat/contracts` は他の全レーンの先行条件。**これが終わるまで他を始めない**
3. `LANE.md` の所有ディレクトリが、やろうとしている作業を含んでいるか
   含んでいないなら、レーンの選択が間違っているか、
   `scripts/lanes.tsv` を直す必要がある（勝手に他所を触らない）

## 4. 共有ファイルは「解決」せず「再生成」する

| ファイル                                            | 競合時の対応                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `bun.lock`                                          | `git checkout --ours bun.lock && bun install && git add bun.lock` |
| `Cargo.lock`                                        | `cargo update -w && git add Cargo.lock`                           |
| `routeTree.gen.ts` / `worker-configuration.d.ts`    | git 管理外。生成し直すだけ                                        |
| ルート `package.json`                               | **そもそも触らない。** 依存は各ワークスペースに足す               |
| ルート `Cargo.toml`                                 | `feat/rust-core` のみが編集する                                   |
| `.oxlintrc.json` / `lefthook.yml` / `tsconfig.json` | `chore/devops` / `feat/contracts` のみ                            |

これ以外が競合したら、**レーンの切り方が間違っている**。
その場で握らず、`docs/parallel-lanes.md` と `scripts/lanes.tsv` を直してから再開する。

## 5. マージ順

```
feat/contracts
  → feat/rust-core, feat/design-system, feat/web-shell
    → feat/decode, feat/print-core, feat/api-worker, feat/wasm-bridge, feat/auth
      → feat/generate-ui, feat/scan-ui, feat/manage-ui
        → feat/print-ui
chore/devops は随時
```

- **rebase を使う。merge commit を作らない。**
- 依存レーンが main に入ったら、その日のうちに `bun run wt sync` する。
  溜めるほど競合の解決コストが上がる。

## 6. 新しいレーンを足す

`scripts/lanes.tsv` に 1 行足し、`docs/parallel-lanes.md` の表と依存グラフも
更新してからコミットする（`chore/devops` レーンの担当）。
所有ディレクトリが既存レーンと**重ならない**ことを確認する。

## 7. エージェントに割り当てるとき

各レーンは独立して完了できるように定義されている。
worktree に入ったエージェントには次だけを渡せばよい:

- `LANE.md`（所有ディレクトリ・依存・チェックリスト）
- `docs/architecture.md` と `docs/domain-model.md`
- 該当スキル（`qrcc-typescript` / `qrcc-html-a11y` / `qrcc-tdd` / `qrcc-architecture`）

**レーンをまたぐ判断が必要になったら止まって相談する**（勝手に他レーンの
ファイルを直さない）。これを守る限り、並行数を増やしても統合は壊れない。
