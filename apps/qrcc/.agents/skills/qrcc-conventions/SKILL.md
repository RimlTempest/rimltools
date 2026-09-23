---
name: qrcc-conventions
description: qrcc 固有のコーディング・マークアップ・テスト・worktree の規約。共通規約（rimltools-typescript / rimltools-html-a11y / rimltools-tdd / rimltools-worktree）と一緒に、apps/qrcc 配下で TS/TSX・JSX/CSS・テスト・レーン作業をするときに読む。Rust engine との境界、生成コードの代替テキスト、カメラ読み取りの通知、ラベル印刷、ゴールデンテスト、cargo test、qrcc のレーン順で発火。
---

# qrcc 固有の規約

共通の規約はリポジトリ直下の skill にある。このプロダクトで作業するときは、
共通の skill と、ここにある差分の両方を読む。

| 分野 | 共通 | qrcc 固有 |
| --- | --- | --- |
| TypeScript | `rimltools-typescript` | [references/typescript.md](references/typescript.md) |
| マークアップ / CSS / a11y | `rimltools-html-a11y` | [references/html-a11y.md](references/html-a11y.md) |
| テスト | `rimltools-tdd` | [references/tdd.md](references/tdd.md) |
| worktree 並行作業 | `rimltools-worktree` | [references/worktree.md](references/worktree.md) |
| 構成・拡張レシピ | — | `qrcc-architecture` |

共通と固有が食い違う場合は **固有を優先**し、食い違いを共通の skill 側に直すか、
理由をここに書く。
