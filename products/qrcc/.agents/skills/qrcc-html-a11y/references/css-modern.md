# 最新 CSS で HTML+CSS だけで完結させる

対象は Baseline Newly available 以上。Firefox 未対応の `text-box-trim` などは
プログレッシブエンハンスメント（`@supports`）で使う。

## カスケードレイヤー

```css
@layer reset, tokens, base, layout, components, utilities;
```

`!important` と詳細度の戦いを設計で回避する。サードパーティ CSS は
`@layer vendor` に押し込む。

## デザイントークン + ダークモード

```css
@layer tokens {
  :root {
    color-scheme: light dark;

    /* 生の色 */
    --gray-0: #ffffff;
    --gray-95: #12131a;
    --brand-50: oklch(0.55 0.16 250);

    /* セマンティック（コンポーネントはこちらだけを参照する） */
    --surface: light-dark(var(--gray-0), var(--gray-95));
    --surface-raised: light-dark(oklch(0.98 0 0), oklch(0.24 0.01 265));
    --text: light-dark(oklch(0.2 0.01 265), oklch(0.95 0.01 265));
    --text-muted: light-dark(oklch(0.42 0.01 265), oklch(0.78 0.01 265));
    --accent: light-dark(var(--brand-50), oklch(0.78 0.13 250));
    --border: light-dark(oklch(0.86 0.01 265), oklch(0.36 0.01 265));
    --focus-ring: light-dark(oklch(0.45 0.2 250), oklch(0.85 0.16 250));

    --space: 0.5rem;
    --radius: 0.5rem;
  }
  /* ユーザーの明示選択が OS 設定を上書きする */
  :root[data-theme='light'] {
    color-scheme: light;
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
  }
}
```

- 色は **oklch** で定義する。明度を数値で操作でき、コントラスト計算が予測しやすい。
- `--text-muted` は AAA の 7:1 を満たす明度まで寄せる。「薄いグレー」で妥協しない。
- 混色が要るときは `color-mix(in oklch, var(--accent) 20%, var(--surface))`。

### ハイコントラストモード

```css
@media (forced-colors: active) {
  .card {
    border: 1px solid CanvasText;
  }
  .icon {
    forced-color-adjust: auto;
  }
}
```

## Container Queries を第一選択に

コンポーネントは自分の幅で判断する。ビューポート幅はページレイアウトだけ。

```css
.code-card {
  container-type: inline-size;
  container-name: card;
}

@container card (inline-size >= 28rem) {
  .code-card__body {
    grid-template-columns: auto 1fr;
  }
}
```

コンテナ相対単位も使える: `font-size: clamp(1rem, 4cqi, 1.5rem);`

### スタイルクエリ

```css
.panel {
  container-name: panel;
}
@container panel style(--density: compact) {
  .row {
    padding-block: 0.25rem;
  }
}
```

## Grid と subgrid

```css
.code-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
  gap: calc(var(--space) * 3);
}
.code-card {
  display: grid;
  grid-template-rows: subgrid; /* 親の行に揃える = カードの高さが自然にそろう */
  grid-row: span 3;
}
```

`auto-fill` + `minmax(min(…, 100%), 1fr)` がレスポンシブの基本形。
メディアクエリなしでカラム数が変わる。

## 状態を CSS で表す

```css
/* 入力が空でないときだけラベルを縮める */
.field:has(input:not(:placeholder-shown)) .field__label {
  scale: 0.85;
}

/* 送信後だけエラーを見せる */
input:user-invalid {
  border-color: var(--danger);
}
input:user-invalid + .field__error {
  display: block;
}

/* details/summary でアコーディオン（JS 不要） */
details::details-content {
  transition:
    block-size 0.2s,
    content-visibility 0.2s allow-discrete;
}
details[open]::details-content {
  block-size: auto;
}

/* popover 属性でツールチップ / メニュー（JS 不要、トップレイヤー、Esc で閉じる） */
[popover]:popover-open {
  opacity: 1;
}
@starting-style {
  [popover]:popover-open {
    opacity: 0;
  }
}

/* テキストエリアが内容に合わせて伸びる */
textarea {
  field-sizing: content;
  max-block-size: 20lh;
}

/* height:auto へのアニメーション */
:root {
  interpolate-size: allow-keywords;
}
```

## アンカーポジショニング

Floating UI 等の JS ライブラリを入れない。

```css
.tooltip-anchor {
  anchor-name: --tip;
}
.tooltip {
  position: absolute;
  position-anchor: --tip;
  position-area: block-start center;
  position-try-fallbacks:
    block-end center,
    inline-end center;
}
```

## タイポグラフィ

```css
body {
  font-size: clamp(1rem, 0.95rem + 0.25vi, 1.125rem);
  line-height: 1.6; /* AAA 1.4.8: 1.5 以上 */
  max-inline-size: 70ch; /* AAA 1.4.8: 80 文字以内 */
  text-align: start; /* 両端揃えにしない */
}
h1,
h2,
h3 {
  text-wrap: balance;
}
p {
  text-wrap: pretty;
  margin-block-end: 1.5em;
}
```

日本語は `word-break: auto-phrase;` と `line-break: strict;` で読みやすくなる。

## 論理プロパティを使う

`margin-left` ではなく `margin-inline-start`、`width` ではなく `inline-size`。
将来の縦書き・RTL に自動対応し、印刷レイアウトの流用も効く。

## モーション

```css
@media (prefers-reduced-motion: no-preference) {
  .dialog {
    transition:
      opacity 0.15s,
      translate 0.15s;
  }
  ::view-transition-group(*) {
    animation-duration: 0.2s;
  }
}
```

**動きは「付ける側」を条件にする。** 既定を静止にしておけば消し忘れが起きない。

## スクロール駆動アニメーション

読み取り進捗バーなどは JS の scroll イベントではなく:

```css
@supports (animation-timeline: scroll()) {
  .progress {
    animation: grow linear;
    animation-timeline: scroll(root block);
  }
}
```

## 印刷 / ラベル面付け

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
