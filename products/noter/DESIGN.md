# DESIGN.md — noter デザインシステム

qrcc のトークン体系（`--qrcc-*`）を `--noter-*` として移植し、エディタ向けの
トークン（presence 8 色、エディタ面、診断色）を足したもの。
**コンポーネントはセマンティックトークンだけを参照する。** 生の色・サイズを書かない。

## 1. 原則

- **静かな道具。** 装飾は最小、コンテンツ（文書）が主役。UI はグレーと 1 色のアクセント。
- **AAA で設計する。** 本文 7:1、大きい文字 4.5:1、UI 境界 3:1、対象 44px、フォーカス 3px。
- **ライト・ダーク同格。** `light-dark()` で 1 か所に両方を書く。片方だけ調整しない。
- **等幅と可変幅の役割分担。** 本文（エディタ・コード・ID・時刻）は等幅、UI 文言は可変幅。

## 2. トークン（`shared/ui/src/styles/tokens.css`）

色は oklch。ライト / ダークの値と、参考コントラスト（対 surface）。

### 2.1 面と文字

| トークン                   | Light                          | Dark                           | 用途                          |
| -------------------------- | ------------------------------ | ------------------------------ | ----------------------------- |
| `--noter-surface`          | `oklch(1 0 0)`                 | `oklch(0.18 0.012 265)`        | ページ地                      |
| `--noter-surface-raised`   | `oklch(0.975 0.002 265)`       | `oklch(0.24 0.014 265)`        | ヘッダ・ツールバー・ダイアログ |
| `--noter-surface-sunken`   | `oklch(0.945 0.004 265)`       | `oklch(0.14 0.01 265)`         | 問題パネル・コードブロック地  |
| `--noter-surface-hover`    | `oklch(0.93 0.006 265)`        | `oklch(0.3 0.016 265)`         | 行・ボタンのホバー            |
| `--noter-surface-editor`   | `oklch(1 0 0)`                 | `oklch(0.16 0.012 265)`        | CodeMirror の地（surface より僅かに沈める） |
| `--noter-text`             | `oklch(0.2 0.012 265)` 15.9:1  | `oklch(0.955 0.006 265)` 15.1:1 | 本文                        |
| `--noter-text-muted`       | `oklch(0.415 0.012 265)` 7.4:1 | `oklch(0.79 0.012 265)` 7.6:1  | 補助（7:1 を割らない）        |
| `--noter-accent`           | `oklch(0.44 0.16 255)`         | `oklch(0.83 0.13 250)`         | 主ボタン・リンク・選択        |
| `--noter-accent-hover`     | `oklch(0.36 0.16 255)`         | `oklch(0.89 0.11 250)`         | 明度のみ動かす                |
| `--noter-on-accent`        | `oklch(1 0 0)`                 | `oklch(0.17 0.03 265)`         | accent 上の文字               |
| `--noter-danger`           | `oklch(0.44 0.19 25)`          | `oklch(0.83 0.14 25)`          | 削除・拒否・構文エラー        |
| `--noter-danger-hover`     | `oklch(0.36 0.19 25)`          | `oklch(0.89 0.12 25)`          |                               |
| `--noter-on-danger`        | `oklch(1 0 0)`                 | `oklch(0.17 0.04 25)`          |                               |
| `--noter-warning`          | `oklch(0.5 0.13 75)`           | `oklch(0.85 0.12 80)`          | 再接続中・オフライン          |
| `--noter-success`          | `oklch(0.42 0.13 150)`         | `oklch(0.83 0.13 150)`         | 同期済み                      |
| `--noter-border`           | `oklch(0.72 0.01 265)` 3.1:1   | `oklch(0.48 0.014 265)` 3.2:1  | UI 境界                       |
| `--noter-border-strong`    | `oklch(0.55 0.012 265)`        | `oklch(0.66 0.014 265)`        | 入力の枠                      |
| `--noter-focus-ring`       | `oklch(0.44 0.2 255)`          | `oklch(0.86 0.16 250)`         | フォーカス                    |

### 2.2 presence（参加者の色）

同じ人は常に同じ色（`actorId` のハッシュ % 8）。カーソル・名前ラベル・アバターで共用。
**色だけで人を識別させない**（必ず名前を併記）。ライト/ダークで明度を変え、
名前ラベル上の文字（`--noter-on-presence`）と 4.5:1 以上。

| index | トークン               | Light                 | Dark                  |
| ----- | ---------------------- | --------------------- | --------------------- |
| 0     | `--noter-presence-0`   | `oklch(0.55 0.17 25)` | `oklch(0.78 0.14 25)` |
| 1     | `--noter-presence-1`   | `oklch(0.55 0.15 60)` | `oklch(0.8 0.13 70)`  |
| 2     | `--noter-presence-2`   | `oklch(0.5 0.13 140)` | `oklch(0.78 0.14 145)`|
| 3     | `--noter-presence-3`   | `oklch(0.5 0.12 190)` | `oklch(0.8 0.11 195)` |
| 4     | `--noter-presence-4`   | `oklch(0.5 0.16 250)` | `oklch(0.8 0.12 250)` |
| 5     | `--noter-presence-5`   | `oklch(0.5 0.18 300)` | `oklch(0.8 0.13 300)` |
| 6     | `--noter-presence-6`   | `oklch(0.55 0.17 340)`| `oklch(0.8 0.13 340)` |
| 7     | `--noter-presence-7`   | `oklch(0.45 0.05 265)`| `oklch(0.75 0.04 265)`|
|       | `--noter-on-presence`  | `oklch(1 0 0)`        | `oklch(0.17 0.02 265)`|

### 2.3 寸法・タイポ

| トークン                | 値                                   |
| ----------------------- | ------------------------------------ |
| `--noter-space-1..8`    | 0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 rem  |
| `--noter-radius`        | 0.5rem（`-sm` 0.25rem、`-lg` 1.5rem） |
| `--noter-target-min`    | 44px                                 |
| `--noter-focus-width`   | 3px（`-offset` 2px）                 |
| `--noter-measure`       | 70ch（プレビュー本文の最大幅）       |
| `--noter-text-sm..2xl`  | 0.875 / 1 / 1.125 / 1.375 / 1.75 rem |
| `--noter-text-code`     | 0.9375rem（エディタ。等幅は 1rem だと大きく見える）|
| `--noter-line-code`     | 1.6                                  |
| `--noter-font-sans`     | `system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic UI', sans-serif` |
| `--noter-font-mono`     | `ui-monospace, 'SFMono-Regular', 'Menlo', 'Consolas', monospace` |
| `--noter-header-h`      | 3.5rem                               |
| `--noter-toolbar-h`     | 3rem                                 |

### 2.4 テーマ切替

```css
:root { color-scheme: light dark; }
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
```

`themeInitScript`（`shared/ui/src/theme/theme.ts`）を `<head>` 先頭で同期実行し、
`localStorage['noter-theme']` を `data-theme` に反映してちらつきを防ぐ。
`theme-color` meta は light / dark の 2 本を `<head>` に直接書く
（TanStack Router の head meta は `name` で重複排除されるため — qrcc で踏んだ）。

## 3. CSS の構成

`shared/ui/src/styles/index.css`:

```css
@layer reset, tokens, base, components, utilities;
@import './reset.css' layer(reset);
@import './tokens.css' layer(tokens);
@import './base.css' layer(base);
@import './components.css' layer(components);
@import './utilities.css' layer(utilities);
@import './print.css';
```

feature の CSS（`features/<name>/ui/<name>.css`）は `apps/web/src/styles/app.css` に
`@import '@noter/<name>/ui/<name>.css' layer(components);` を**追記のみ**。

クラス命名: `.noter-<block>__<element>` + 状態は `data-*`（`data-variant`, `data-state`）。

## 4. コンポーネント

### 4.1 共通（`shared/ui`）

| コンポーネント        | クラス                         | 要点                                                    |
| --------------------- | ------------------------------ | ------------------------------------------------------- |
| SkipLink              | `.noter-skip-link`             | 最初のフォーカス可能要素。`#main` へ                     |
| Button                | `.noter-button[data-variant]`  | `primary` / `secondary` / `danger` / `ghost`。最小 44px  |
| IconButton            | `.noter-button[data-icon]`     | 可視ラベル無しなら `aria-label` 必須 + ツールチップは CSS |
| Field                 | `.noter-field__*`              | label / control / hint / error（`aria-describedby`）    |
| Dialog                | `.noter-dialog`                | ネイティブ `<dialog>`。Esc で閉じ、フォーカス復帰       |
| Menu                  | `.noter-menu`                  | `<button popovertarget>` + `[popover]` の `<ul role="menu">` |
| StatusPill            | `.noter-pill[data-tone]`       | `muted` / `success` / `warning` / `danger`。アイコン + 文言 |
| Toast                 | `.noter-toast`                 | `role="status"`。20 秒 or 閉じるボタン。Undo 付き       |
| LiveRegion            | `.noter-live-region`           | 常設 `role="status"`。`noter-visually-hidden`           |
| ThemeToggle           | `.noter-theme-toggle`          | 3 状態（system / light / dark）の `<fieldset>` ラジオ   |
| Table                 | `.noter-table`                 | `<table>` を維持し、狭幅は `display:grid` で見た目のみ  |
| Avatar                | `.noter-avatar`                | イニシャル + `--noter-presence-N`。`aria-hidden`、名前は隣に |

### 4.2 エディタ（`features/editor/ui`）

| 部品            | クラス                     | 要点                                                                  |
| --------------- | -------------------------- | --------------------------------------------------------------------- |
| Workspace       | `.noter-workspace[data-view]` | Grid。`editor` / `split` / `preview`。48rem 未満は縦積み           |
| Toolbar         | `.noter-toolbar`           | `role="toolbar" aria-label="編集"`。矢印キーで移動（roving tabindex） |
| ViewSwitch      | `.noter-view-switch`       | 3 つの `<button aria-pressed>`                                        |
| EditorPane      | `.noter-pane[data-pane=editor]` | CodeMirror。`EditorView.theme` はトークンをそのまま参照            |
| PreviewPane     | `.noter-pane[data-pane=preview]` | `<section aria-label="プレビュー">`。`.noter-prose` で組版      |
| Problems        | `.noter-problems`          | `<ul>`。各行 `<button>` でジャンプ。tone は danger / warning          |
| Presence        | `.noter-presence`          | アバター最大 3 + `+N`。ポップオーバーで `<ul aria-label="参加者">`    |
| RemoteCursor    | `.cm-ySelection*`          | y-codemirror.next 既定クラスにトークンの色を当てる。`aria-hidden`     |
| ShareDialog     | `.noter-share`             | Dialog + Field + Table（リンク一覧・参加者一覧）                      |
| ImportDropzone  | `.noter-dropzone`          | `<label>` + `<input type=file>`。DnD は補助（キーボードで同等）       |

### 4.3 CodeMirror テーマ（`features/editor/ui/src/theme.ts`）

```ts
EditorView.theme({
  '&': { backgroundColor: 'var(--noter-surface-editor)', color: 'var(--noter-text)',
         fontSize: 'var(--noter-text-code)', fontFamily: 'var(--noter-font-mono)' },
  '.cm-content': { lineHeight: 'var(--noter-line-code)', caretColor: 'var(--noter-text)' },
  '.cm-gutters': { backgroundColor: 'var(--noter-surface-sunken)', color: 'var(--noter-text-muted)',
                   borderRight: '1px solid var(--noter-border)' },
  '.cm-activeLine': { backgroundColor: 'var(--noter-surface-hover)' },
  '&.cm-focused': { outline: 'var(--noter-focus-width) solid var(--noter-focus-ring)', outlineOffset: '-3px' },
  '.cm-lintRange-error': { textDecoration: 'underline wavy var(--noter-danger)' },
})
```

構文ハイライトは `@lezer/highlight` の `HighlightStyle` で **6 色以内**、すべて 7:1 を満たす
明度（ダークは `--noter-presence-*` と同じ彩度帯）。色相だけに意味を持たせない
（キーワードは太字も併用）。

### 4.4 Mermaid

`mermaid.initialize({ theme: isDark ? 'dark' : 'default', securityLevel: 'strict', startOnLoad: false })`。
描画結果の `<svg>` に `role="img"` と `aria-label="図 N: <mermaid の 1 行目>"` を付け、
直後に `<details><summary>図のソース</summary><pre>` を置く。テーマ切替時は再描画。

## 5. レイアウト

- ヘッダ 3.5rem、ツールバー 3rem、残りをワークスペース（`100dvb`）。
- コンテナクエリ（`container-type: inline-size` を `.noter-workspace` に）で
  48rem 未満は縦積み + 既定「エディタ」。
- 320px 幅で横スクロール無し（ツールバーは `flex-wrap`、ラベルはアイコン + `aria-label` に縮退しない —
  **ラベルは省略せず折り返す**）。
- プレビュー本文は `max-inline-size: var(--noter-measure)`、`text-wrap: pretty`。

## 6. モーション

- `transition` は 150ms 以下、`opacity` / `transform` のみ。
- `prefers-reduced-motion: reduce` で全停止（グローバル）。
- 他人のカーソルは**アニメーションしない**（位置が飛ぶだけ）。点滅しない。

## 7. アイコン

インライン SVG（`shared/ui/src/icons/*.tsx`）、`aria-hidden="true"`、`currentColor`。
外部アイコンフォント・CDN は使わない。20 個以内に抑える。

## 8. 禁止

- 生の色コード・px サイズをコンポーネント CSS に書く
- `title` 属性をラベル代わりにする
- ホバーでしか出ない情報（時刻・名前）
- 色だけの状態表現（必ずアイコンか文言）
- `aria-label` が可視テキストと異なるボタン
