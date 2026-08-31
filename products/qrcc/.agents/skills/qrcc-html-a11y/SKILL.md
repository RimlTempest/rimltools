---
name: qrcc-html-a11y
description: qrcc2 のマークアップ・CSS・アクセシビリティ規約。JSX/HTML/CSS を書く・直す・レビューする前に必ず読む。WCAG 2.2 AAA を目標に、意味の合うタグを最優先し ARIA は最後の手段、スクリーンリーダーの読み上げ順と発話内容まで設計する。CSS は Grid / Container Queries / light-dark() で HTML+CSS だけで完結させ、ダークモードとレスポンシブを標準装備する。「見た目を作る」「div にした」「role を付ける」「モーダル/タブ/トースト」「色をどうするか」「印刷レイアウト」で発火。
---

# qrcc2 マークアップ / CSS / アクセシビリティ規約

目標は **WCAG 2.2 AAA**。到達できない項目は「なぜ無理か」と代替手段を
`docs/accessibility.md` に記録する（黙って諦めない）。

## 0. 判断の優先順位

1. **意味の合う HTML 要素があるならそれを使う**（`button` `a` `dialog` `details`
   `table` `fieldset` `output` `progress` `input type=color` …）
2. 要素で足りない部分だけ **ARIA を足す**（打ち消しではなく補強）
3. 見た目・状態表現は **CSS だけで**（`:has()` `:user-invalid` `@container` `popover`）
4. どうしても足りないときだけ JS。JS が落ちても主要機能が壊れないこと

**ARIA の第一法則: ネイティブ要素で済むなら ARIA を使うな。**
`role="button"` を書きそうになったら `<button>` を使う。
`aria-label` で見えるテキストを上書きしない（音声操作ユーザーが押せなくなる）。

## 1. 構造とランドマーク

```html
<body>
  <a class="skip-link" href="#main">本文へスキップ</a>
  <header><nav aria-label="グローバル">…</nav></header>
  <main id="main" tabindex="-1">
    <h1>…</h1>
  </main>
  <aside aria-labelledby="related-h">…</aside>
  <footer>…</footer>
</body>
```

- `main` は 1 ページ 1 つ。`h1` も 1 つ。見出しレベルは飛ばさない（AAA 2.4.10）。
- 同種のランドマークが複数あるときは `aria-label` / `aria-labelledby` で区別する。
- パンくず（AAA 2.4.8）は `<nav aria-label="パンくず"><ol>` + 現在地に `aria-current="page"`。
- リンクテキスト単体で行き先が分かること（AAA 2.4.9）。「こちら」「詳細」は禁止。

## 2. スクリーンリーダーを想定して書く

- **読み上げ順 = DOM 順**。`order` / `grid-row` で視覚順を変えたら、DOM 順も直す。
- 動的更新は `aria-live`。`polite` が既定、エラーだけ `assertive`。
  live region は**最初から DOM にあること**（後から挿入すると読まれない）。
- 生成した QR / バーコードは装飾ではなく **情報**。
  `<img alt="QRコード: https://example.com（内容はこの下のテキストでも確認できます）">`
  に加え、**エンコード内容を必ずテキストでも併記**する（1.1.1 / 1.4.5）。
- 純粋な装飾は `alt=""` + `aria-hidden="true"`。
- アイコンのみのボタンには可視ラベルを付けるか、最低でも `aria-label` +
  `title` ではなくツールチップを CSS で。
- 詳細パターン（ダイアログ・タブ・コンボボックス・トースト・カメラ読み取りの
  ライブ通知）は [references/aria-patterns.md](references/aria-patterns.md)。

## 3. フォーム

- `label` と入力は必ず `for`/`id` で結ぶ。プレースホルダをラベル代わりにしない。
- グループは `fieldset` + `legend`（例: 誤り訂正レベルのラジオ群）。
- エラーは `aria-describedby` で入力に紐付け、`aria-invalid="true"` を付ける。
  エラーサマリは live region に出し、最初のエラー項目にフォーカスを移す。
- 検証は `:user-invalid` を使い、入力途中で赤くしない。
- 破壊的操作（削除・共有解除）は取り消し可能にする（AAA 3.3.6）。
- 認証は Google OAuth とゲストの 2 経路。パスワード記憶・パズルを課さない
  （AAA 3.3.9 を満たす設計）。

## 4. キーボードとフォーカス

- すべての機能がキーボードだけで使える（AAA 2.1.3）。キーボードトラップ禁止。
- フォーカスリングを消さない。`:focus-visible` に **2px 以上・周囲と 3:1 以上**の
  可視インジケータ（AAA 2.4.13）。
- フォーカスされた要素が他の要素で隠れない（AAA 2.4.12）。sticky ヘッダに注意し
  `scroll-margin-top` を確保する。
- クリック対象は **44×44 CSS px 以上**（AAA 2.5.5）。狭く見せたい場合は
  疑似要素でヒットエリアだけ広げる。
- `tabindex` は `0` と `-1` のみ（正数禁止）。

## 5. 色・コントラスト・モーション

- テキスト **7:1**、大きい文字 **4.5:1**（AAA 1.4.6）。UI 部品の境界は 3:1 以上。
- 情報を色だけで伝えない。形・テキスト・アイコンを併用する。
- 本文は 80 文字/行以内、行間 1.5、段落間 1.5em、両端揃えにしない（AAA 1.4.8）。
- 400% 拡大しても横スクロールが出ないこと（1.4.10）。
- `@media (prefers-reduced-motion: reduce)` で動きを止める（AAA 2.3.3）。
- 点滅は 1 秒に 3 回未満（AAA 2.3.2）。カメラ読み取りの成功フィードバックに注意。

## 6. CSS の書き方

**HTML と CSS で完結させる。JS でレイアウトを計算しない。** 詳細と実例は
[references/css-modern.md](references/css-modern.md)。

- レイアウト: `grid` + `subgrid`。`gap` を使い margin で隙間を作らない。
- レスポンシブ: **メディアクエリではなく Container Queries を第一選択**。
  コンポーネントは「自分が置かれた幅」に応じて変わる。ビューポート依存は
  ページレベルのみ。
- カラー: `@layer` でカスケードを設計し、`:root` に **セマンティックトークン**を
  定義。`light-dark()` と `color-scheme` でダークモードを 1 セットで表現する。
- タイポ: `clamp()` で流体スケール。`text-wrap: balance`（見出し）/ `pretty`（本文）。
- 状態表現: `:has()` `:user-invalid` `:popover-open` `@starting-style` `field-sizing`。
- スコープ: `@scope` かクラス命名。深いセレクタと `!important` を使わない。
- 単位: フォントは `rem`、コンポーネント内寸法は `em` / `cqi`。`px` はボーダーのみ。

## 7. ダークモード

```css
:root {
  color-scheme: light dark;
}
:root {
  --bg: light-dark(#fff, #12131a);
  --fg: light-dark(#16181d, #e9eaf0);
}
[data-theme='light'] {
  color-scheme: light;
}
[data-theme='dark'] {
  color-scheme: dark;
}
```

- 既定は OS 追従。ユーザーの明示選択は `data-theme` で上書きし、SSR 時に
  インライン script でちらつきを防ぐ。
- ダークでもコントラスト 7:1 を維持する（暗い背景では彩度を落とす）。
- `forced-colors: active`（Windows ハイコントラスト）で壊れないこと。

## 8. 印刷 / ラベル

- 画面用 CSS と別に `@media print` と `@page` を持つ。用紙・余白は `@page` で。
- ラベル面付けは Grid + `break-inside: avoid`。JS で座標計算しない。
- 印刷でも QR の内容テキストを出す。リンクは `a[href]::after { content: " (" attr(href) ")" }`。

## 9. 検証

コミット前:

- `bun run lint`（oxlint jsx-a11y） / `bun run lint:html`（markuplint）
- `bun run a11y`（Playwright + axe-core、AAA タグ込み）

自動チェックは 3 割しか見つけない。必ず [references/manual-checks.md](references/manual-checks.md)
のキーボード操作・拡大・読み上げの手動確認を行う。
AAA 達成状況と例外は `docs/accessibility.md` に記録する。
