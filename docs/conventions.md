# コミットとレビューの規約

どちらも **CI とフックで機械的に検査する**。検査ロジックは `scripts/lib/conventional.ts` 1 か所。

| 対象               | 規約                                                       | 検査                                     | 必須チェック        |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------- | ------------------- |
| コミットメッセージ | Conventional Commits 1.0.0                                 | lefthook `commit-msg`、CI `conventional` | ✅                  |
| PR タイトル        | Conventional Commits 1.0.0（マージ時のコミット件名になる） | CI `conventional`                        | ✅                  |
| レビューコメント   | Conventional Comments                                      | CI `conventional-comments`               | —（失敗は表示のみ） |

## Conventional Commits

```
<type>(<scope>)!: <description>

<body>

<footer>
```

- **type**: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
- **scope**（任意）: 小文字・数字・`-`・`/`。プロダクトの変更は `<tool>/<area>` を推奨。
  例: `feat(qrcc/render): ...` `fix(noter/sync): ...` `ci(release): ...` `docs(adr): ...`
- **`!`** と `BREAKING CHANGE: <説明>` フッターで破壊的変更を示す。
- 件名は 100 文字以内、`:` のあとに半角スペース 1 つ。本文との間は空行。
- `Refs: #12` `Co-Authored-By: ...` などは footer に置く。

GitHub のマージ設定は「タイトル = PR タイトル、本文 = PR 本文」にしてあるので、
squash（develop）でも merge commit（main）でも、残るコミットはこの規約を満たす。

## Conventional Comments

```
<label> [(decorations)]: <subject>

[discussion]
```

| label        | 意味                                    |
| ------------ | --------------------------------------- |
| `praise`     | 良い点。最低 1 つは書く                 |
| `nitpick`    | 好みの範囲の細かい指摘。対応は任意      |
| `suggestion` | 改善案。何をなぜ変えるかを書く          |
| `issue`      | 問題。可能なら `suggestion` を添える    |
| `todo`       | マージ前に必要な小さな作業              |
| `question`   | 確認したいこと                          |
| `thought`    | 対応不要の考え・アイデア                |
| `chore`      | マージ前に要る手続き（CI の再実行など） |
| `note`       | 読み手に知っておいてほしいこと          |

| decoration                           | 意味                     |
| ------------------------------------ | ------------------------ |
| `blocking`                           | 解決するまでマージしない |
| `non-blocking`                       | マージを止めない         |
| `if-minor`                           | 変更が小さければ対応する |
| `security` `a11y` `perf` `test` `ux` | 観点のタグ               |

例:

```
issue (blocking, security): Cloudflare のトークンがログに出ている

`console.log(env)` を消すか、出力前に伏せ字にしてほしい。
```

- 検査対象は **スレッド先頭のレビューコメント** と **本文のあるレビュー**。返信と bot の投稿は対象外。
- `**issue (blocking):**` のように太字にしてもよい。

参考: <https://www.conventionalcommits.org/ja/v1.0.0/> / <https://conventionalcomments.org/>
