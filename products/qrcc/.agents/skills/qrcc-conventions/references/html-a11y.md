# qrcc のマークアップ / a11y 固有事項

共通の規約は `rimltools-html-a11y`（タブ・コンボボックス・テーブルの例は qrcc のドメイン）。ここには生成コード・カメラ・ラベル印刷を置く（統合前の `qrcc-html-a11y` から移した）。

## 生成したコードは情報

- 生成した QR / バーコードは装飾ではなく **情報**。
  `<img alt="QRコード: https://example.com（内容はこの下のテキストでも確認できます）">`
  に加え、**エンコード内容を必ずテキストでも併記**する（1.1.1 / 1.4.5）。

## カメラ読み取りのライブ通知

読み取りは視覚フィードバックだけでは不十分。

```tsx
<div role="status" aria-live="polite">
  {state.kind === 'scanning' ? 'カメラで読み取り中です' : null}
  {state.kind === 'detected' ? `読み取りました: ${state.text}` : null}
</div>
```

- 検出のたびに読み上げると煩いので、**同じ値の連続は抑制**する。
- カメラ不可・権限拒否の状態も必ず読み上げ、**画像ファイルからの読み取り**という
  代替経路を同じ画面に置く（2.1.1 の代替手段）。
- `<video>` には `aria-hidden="true"` を付け、状態は上記 live region に集約する。

## 印刷 / ラベル

- 画面用 CSS と別に `@media print` と `@page` を持つ。用紙・余白は `@page` で。
- ラベル面付けは Grid + `break-inside: avoid`。JS で座標計算しない。
- 印刷でも QR の内容テキストを出す。リンクは `a[href]::after { content: " (" attr(href) ")" }`。

## ラベル面付けの CSS

```css
@page label-a4-24 {
  size: A4 portrait;
  margin: 13.5mm 8mm;
}
@media print {
  .no-print {
    display: none;
  }
  .sheet {
    display: grid;
    grid-template-columns: repeat(3, 64mm);
    grid-auto-rows: 33.9mm;
    gap: 0 2.5mm;
  }
  .label {
    break-inside: avoid;
  }
  a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.75em;
  }
}
```

用紙定義は CSS カスタムプロパティで持ち、ラベル台紙の型番ごとに切り替える。
座標計算を JS でやらない。

## 手動確認（qrcc 固有）

- [ ] 点滅は 1 秒に 3 回未満。カメラ読み取りの成功フィードバックに注意
- [ ] 印刷プレビューでラベルが用紙からはみ出さない
