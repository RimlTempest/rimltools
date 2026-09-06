# ARIA パターン集（noter で実際に使うものだけ）

出典: WAI-ARIA Authoring Practices Guide (APG)。**ネイティブ要素で足りるものは
ここに載せていない。**

## ダイアログ → `<dialog>` を使う

```tsx
<dialog ref={ref} aria-labelledby="dlg-title">
  <h2 id="dlg-title">コードを削除しますか？</h2>
  <form method="dialog">
    <button value="cancel">キャンセル</button>
    <button value="confirm">削除</button>
  </form>
</dialog>
```

`showModal()` がフォーカストラップ・`inert`・Esc・トップレイヤーを全部やる。
自前で `role="dialog"` + フォーカス管理を書かない。
閉じたあとは **開いたトリガーにフォーカスを戻す**（ブラウザがやらない場合がある）。

## トースト / 保存完了通知

```tsx
{
  /* 最初から DOM に存在させる。中身だけ差し替える */
}
;<div role="status" aria-live="polite" className="toast-region">
  {message}
</div>
```

- 成功・進捗は `role="status"`（= `aria-live="polite"`）
- 入力エラーなど即時性が要るものだけ `role="alert"`（= `assertive`）
- トーストを自動で消すなら **最低 20 秒**、または閉じるボタンを常設（AAA 2.2.3 / 2.2.6）

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

## コードエディタ

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

## タブ（表示モードの切替）

タブは**本当にタブである必要があるか**を先に疑う。`details` の並びや
リンク付きセクションで済むことが多い。必要なら APG に従う:

```tsx
<div role="tablist" aria-label="表示">
  <button role="tab" id="t-split" aria-selected={sel === 'split'} aria-controls="p-split" tabIndex={sel === 'split' ? 0 : -1}>分割</button>
</div>
<div role="tabpanel" id="p-split" aria-labelledby="t-split" tabIndex={0}>…</div>
```

矢印キー移動 + roving tabindex が必須。実装しないなら tablist を名乗らない。

## コンボボックス（文書の検索・選択）

**まず `<select>` を検討する。** 100 種類を超えて検索が要るときだけ APG の
combobox パターン（`role="combobox"` + `aria-expanded` + `aria-controls` +
`aria-activedescendant`）を実装する。

## 折りたたみ

```tsx
<details>
  <summary>詳細オプション</summary>…
</details>
```

`aria-expanded` を自分で管理する `role="button"` を書かない。

## 進捗

```tsx
<progress id="pdf-progress" max={100} value={done} />
<label htmlFor="pdf-progress">PDF 生成の進捗</label>
```

不定進捗は `value` を省く。`role="progressbar"` を手書きしない。

## テーブル（コード一覧）

```tsx
<table>
  <caption>最近の文書</caption>
  <thead>
    <tr>
      <th scope="col">名前</th>
      <th scope="col">種類</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">デプロイ手順</th>
      <td>Markdown</td>
    </tr>
  </tbody>
</table>
```

- 並べ替え可能な列見出しは `aria-sort="ascending|descending|none"`。
- カード表示に切り替えるときも DOM は table のままにし、
  `display: grid` で見た目だけ変える（`display` 変更で table セマンティクスが
  失われる場合は `role="table"` 等で補う — markuplint が検出する）。

## やってはいけないこと

- `aria-label` で可視テキストと違う名前を付ける（音声操作で押せなくなる）
- `role="presentation"` をインタラクティブ要素に付ける
- `aria-hidden="true"` の中にフォーカス可能要素を残す
- `title` 属性をラベル代わりにする（タッチ・キーボードで読めない）
- `div` に `onClick` だけ付ける（`click-events-have-key-events` が落ちる）
