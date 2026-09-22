---
name: noter-conventions
description: noter 固有のコーディング・マークアップ・テスト・worktree の規約。共通規約（rimltools-typescript / rimltools-html-a11y / rimltools-tdd / rimltools-worktree）と一緒に、apps/noter 配下で TS/TSX・JSX/CSS・テスト・レーン作業をするときに読む。Durable Object の class 例外、2 つの composition root、WebSocket close code、Mermaid 図・同時編集カーソル・CodeMirror の a11y、Yjs の収束テスト、noter のレーン順で発火。
---

# noter 固有の規約

共通の規約はリポジトリ直下の skill にある。このプロダクトで作業するときは、
共通の skill と、ここにある差分の両方を読む。

| 分野 | 共通 | noter 固有 |
| --- | --- | --- |
| TypeScript | `rimltools-typescript` | [references/typescript.md](references/typescript.md) |
| マークアップ / CSS / a11y | `rimltools-html-a11y` | [references/html-a11y.md](references/html-a11y.md) |
| テスト | `rimltools-tdd` | [references/tdd.md](references/tdd.md) |
| worktree 並行作業 | `rimltools-worktree` | [references/worktree.md](references/worktree.md) |
| 構成・拡張レシピ | — | `noter-architecture` |

共通と固有が食い違う場合は **固有を優先**し、食い違いを共通の skill 側に直すか、
理由をここに書く。
