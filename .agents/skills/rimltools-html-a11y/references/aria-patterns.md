# ARIA パターン集（qrcc2 で実際に使うものだけ）

出典: WAI-ARIA Authoring Practices Guide (APG)。**ネイティブ要素で足りるものは
ここに載せていない。**

ライブ通知の具体例（qrcc のカメラ読み取り、noter の同期状態・参加者）と noter のコードエディタは
`<tool>-conventions` の `references/html-a11y.md`。

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

## タブ（例 qrcc: 生成オプションの切替）

タブは**本当にタブである必要があるか**を先に疑う。`details` の並びや
リンク付きセクションで済むことが多い。必要なら APG に従う:

```tsx
<div role="tablist" aria-label="出力形式">
  <button role="tab" id="t-svg" aria-selected={sel === 'svg'} aria-controls="p-svg" tabIndex={sel === 'svg' ? 0 : -1}>SVG</button>
</div>
<div role="tabpanel" id="p-svg" aria-labelledby="t-svg" tabIndex={0}>…</div>
```

矢印キー移動 + roving tabindex が必須。実装しないなら tablist を名乗らない。

## コンボボックス（例 qrcc: symbology 選択）

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

## テーブル（例 qrcc: コード一覧）

```tsx
<table>
  <caption>保存済みコード一覧</caption>
  <thead>
    <tr>
      <th scope="col">名前</th>
      <th scope="col">種類</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">在庫ラベル</th>
      <td>Code128</td>
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
