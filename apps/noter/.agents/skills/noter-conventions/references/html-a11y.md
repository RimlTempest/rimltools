# noter のマークアップ / a11y 固有事項

共通の規約は `rimltools-html-a11y`。ここには noter だけの要素（Mermaid 図・同時編集・コードエディタ・印刷）を置く（統合前の `noter-html-a11y` から移した）。

## 図と他人のカーソル

- **Mermaid 図は装飾ではなく情報**。`<svg role="img" aria-label="図: <最初の行の要約>">`
  に加え、**図のソース（mermaid コード）をテキストで併記**できる開閉 UI を置く
  （1.1.1 / 1.4.5）。図の中のテキストを読み上げに頼らない。
- **他の人のカーソル・選択範囲は装飾扱い**（`aria-hidden`）。参加者の出入りは
  live region で 1 回だけ告知し、カーソル移動は告知しない（読み上げが止まらなくなる）。

## コードエディタ（CodeMirror）と分割ペイン

- エディタは `role="textbox"` + `aria-multiline="true"` を CodeMirror が付ける。
  **アクセシブル名は自分で付ける**（`EditorView.contentAttributes` に
  `aria-label: '<タイトル> の本文（<種別>）'`）。
- Tab はエディタ内でインデントに使う。**Esc → Tab でエディタから抜けられる**ことを
  必ず残す（2.1.2 キーボードトラップなし）。抜け方はエディタ直前のテキストで説明する。
- プレビューは `<section aria-label="プレビュー">`、エディタ本体は `<section aria-label="エディタ">`。
  分割の比率変更は `<button>` 群（「エディタのみ」「分割」「プレビューのみ」）で提供し、
  ドラッグだけに頼らない（2.5.7）。
- 診断（構文エラー）は CodeMirror の lint gutter に加えて、**エディタ外の
  `<ul aria-label="問題">` にも列挙**し、各項目からその行へ移動できるボタンを付ける。
- 幅 320px では分割を縦積みにし、既定は「エディタのみ」+ 切替ボタン。

## 印刷（プレビューを印刷する）

- 画面用 CSS と別に `@media print` を持つ。印刷するのは**プレビュー（描画結果）**。
  エディタ・ツールバー・参加者表示は `.no-print`。
- リンクは `a[href]::after { content: " (" attr(href) ")" }`。
- ダークテーマでも印刷は白背景・黒文字。

## 同期状態と参加者のライブ通知

接続状態・保存状態は視覚（ステータスピル）だけでは不十分。

```tsx
<p role="status" aria-live="polite" className="noter-visually-hidden">
  {announcement /* '接続しました' | '再接続しています' | 'オフラインです。編集は再接続後に送信されます' */}
</p>
```

- **同じ状態の連続は抑制**する。`connected` → `connected` で再読み上げしない。
- 参加者の入退室は「Aさんが参加しました」を 1 回。**カーソル移動・選択変更は告知しない**。
  3 秒以内に複数人が参加したら「3 人が参加しました」にまとめる。
- 「保存しました」は読み上げない（数秒ごとに発生する）。代わりに `aria-describedby`
  でエディタに「最終保存 12:34」を結び、要求時に読めるようにする。
- 権限で編集できない（viewer）ときはエディタの直前に `<p>` で明示し、
  CodeMirror は `EditorState.readOnly` + `aria-readonly="true"`。

## コードエディタ（ARIA）

CodeMirror 6 の contentDOM は `role="textbox" aria-multiline="true"` を持つ。

```ts
EditorView.contentAttributes.of({
  'aria-label': `${title} の本文（${kindLabel}）`,
  'aria-describedby': 'editor-help', // 「Esc のあと Tab でエディタから抜けられます」
})
```

- 行番号ガターは `aria-hidden`（CodeMirror 既定）。
- 診断は `linter()` の gutter マーカーだけに頼らず、エディタ外に `<ul>` で列挙する。
- 他人のカーソル（y-codemirror.next のウィジェット）は `aria-hidden="true"`。
  名前ラベルはホバー/フォーカスで出す装飾なので、参加者一覧（`<ul aria-label="参加者">`）
  を別に持つ。

## 例（noter のドメイン）

- タブ: `aria-label="表示"`（分割 / エディタのみ / プレビューのみ）
- コンボボックス: 文書の検索・選択
- テーブル: `<caption>最近の文書</caption>`

## 分割ペイン（エディタ | プレビュー）

```css
.noter-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  block-size: 100dvb;
}
.noter-workspace[data-view='split'] {
  grid-template-columns: minmax(20rem, 1fr) minmax(20rem, 1fr);
}
@container (inline-size < 48rem) {
  .noter-workspace[data-view='split'] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr);
  }
}
.noter-pane {
  min-block-size: 0; /* Grid の子がはみ出さない */
  overflow: auto;
  overscroll-behavior: contain;
}
```

- 比率は `data-view` 属性で切り替える（ボタンから変更できる = ドラッグ非依存）。
- `minmax(0, …)` を忘れると長い行でグリッドが押し広げられる。
- スクロール同期は `scroll-timeline` ではなく、エディタの可視行 → プレビュー見出しの
  `scrollIntoView({ block: 'start' })` を **ユーザー操作時のみ** 呼ぶ（JS 最小限）。

## 印刷の CSS

```css
@media print {
  .no-print {
    display: none;
  }
  .noter-workspace {
    display: block;
    block-size: auto;
  }
  .noter-preview {
    color: #000;
    background: #fff;
  }
  a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.75em;
  }
}
```

印刷するのは描画済みプレビューだけ。エディタとツールバーは `.no-print`。

## 手動確認: 同時編集

- [ ] 2 つのブラウザで同じ文書を開き、片方の入力がもう片方に 1 秒以内に反映される
- [ ] 片方をオフラインにして入力し、復帰後に両者の内容が一致する
- [ ] viewer 権限のタブでは入力できず、その理由が読み上げられる
