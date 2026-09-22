# ADR-0012: WebMCP は読み取り・診断のみ公開し、編集は提案 UI を経由する

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0010 を移植・改訂 / [ADR-0009](0009-free-tier-d1-and-do-only.md)

## 文脈

qrcc では生成・読み取り（副作用なし）を WebMCP（`document.modelContext`）の
ツールとして公開した。noter で同じことをすると「文書を読む」「診断する」は
副作用が無いが、「文書を書き換える」は**共同編集中の他人の文書を、その人の
確認なしにエージェントが変えてしまう**経路になる。

WebMCP は 2026-09 時点で Origin Trial 段階（Chrome 149 / Edge 150）。
既定ではどのブラウザでも有効になっていない。

## 決定

- 公開するツール:
  - `read-document` … 現在開いている文書の本文と kind を返す
  - `diagnose-document` … 現在の診断（構文エラー等）を返す
  - `list-documents` … 自分の文書一覧（id / title / kind）を返す
- **編集系のツールは「提案」までにする。** `propose-edit(text)` はエディタに
  差分プレビューを出し、**ユーザーが「適用」を押すまで文書に触れない**。
  適用は通常の編集操作と同じ経路（Yjs トランザクション）で流れる
- **Origin Trial トークンは登録しない。** API が無い環境では何もしない
  （挙動が変わらないことをテストで固定）
- `exposedTo` は使わない（同一オリジン + ブラウザ組み込みエージェントのみ）
- ツールは Worker を呼ばない。すべてクライアントのメモリ上の `Y.Doc` と
  `features/formats/core` で完結する（`list-documents` のみ既にロード済みの
  一覧を返し、追加のリクエストを出さない）

## 理由

- 読み取り・診断はブラウザ内で完結し、Worker も D1 も消費しない
- 「提案 → 人が適用」にすることで、共同編集の他の参加者から見ても
  「誰かが編集した」以上のことは起きない。エージェント由来の編集を
  区別する必要も無い（適用した人の編集になる）
- Origin Trial トークンは期限つきで静かに失効する。運用コストに見合わない

## 帰結

- `shared/webmcp` は **`features/*` に依存しない**汎用アダプタ（`document.modelContext` の
  有無判定・`registerTool` の呼び出し・`sessionStorage` の一覧の預かり）。本文・診断・
  提案の実体は `features/editor/ui/editor.route.tsx` が関数（deps）として渡す。
  `shared/` が feature に依存すると層が逆転するため（plan 007 レビューで改訂）
- `propose-edit` の差分 UI は `features/editor/ui/proposal-panel.tsx`。
  WebMCP 以外（将来のインポート機能など）からも使えるよう、WebMCP に依存しない
- 削除・共有・メンバー操作はツールにしない。したくなったら認可の設計からやり直す
