# 011: 窓（Mado）の見た目を qrcc に入れる — 基盤（shared/ui）

**優先度**: P1　**規模**: M　**依存**: 010（DONE）、riml-ds plan 014・015 が riml-ds の main に入っていること　**レーン**: `feat/mado-ui`
**計画時の main**: `fc1896b`

> **Drift check（最初に実行）**:
> `git diff --stat fc1896b..HEAD -- shared/ui vendor scripts/vendor-riml-ds.sh scripts/lanes.tsv docs/adr`
> 差分が出たら内容を読む。`shared/ui/src/styles/tokens.css` に `--qrcc-*` が増えていたら Step 2 の表に足す。
> `shared/ui/src/components/` にファイルが増えていたら `index.ts` の export 順を崩さずに Step 4 を続ける。
>
> riml-ds 側の前提: `cd /Users/riml/orca/projects/riml-ds && git log --oneline -1 main && command ls system/css/dist/patterns.css system/tokens/dist/tokens.css`
> `patterns.css` が無ければ riml-ds plan 015 がまだ入っていない。**STOP** して報告する。

## なぜ

riml-ds はブランド（riml: 紙色の地・インク色の文字・青紫のアクセント）と、**窓（Mado）** の見た目を決めた
（riml-ds `docs/brand.md`、`docs/adr/0013-riml-brand-and-mado.md`）。要点:

- 部品は **窓**: クリーム色の面に、灰茶色の**タイトル帯**（左に 3 つの丸、中央に太い丸ゴシックの題）を載せ、
  ぼかしの無い**硬い影**（`--rd-shadow-raised`: 右下 0.25rem）で浮かせる
- ボタンは**ピル**（`border-radius: 9999px`）、太字、枠線なし。secondary は「沈んだ面」の塗り
- 入力欄は「浮いた面 + 枝色の枠」の井戸。チェックは角丸 sm、スイッチは太いピル
- 区切りは**点線**（`hr`: 0.125rem dotted）
- 見出し h1/h2 は丸ゴシック系の `--rd-font-family-display`
- 色相は qrcc テーマ（青 hue 255 / 中性色 hue 265）のまま。**形と質感だけ**を riml-ds から取る

段階 1（plan 010）で `--qrcc-*` を `--rd-*` の別名にしたので、riml-ds 側の角丸・影・書体の変更は tarball を
更新するだけで半分は流れてくる。この計画は残り半分 — riml-ds の `patterns.css`（`.rd-window`）を取り込み、
`shared/ui` の部品 CSS を窓の言語に揃え、feature 側が使う **`<Window>` React 部品**を用意する — を行う。
feature 画面（`features/*/ui`）への適用は **plan 012** で別レーン。この計画では `features/**` を触らない。

## リポジトリの決まり（守る）

- `any` / `as` / `!` / `class` / `enum` を書かない（`.oxlintrc.json` の `qrcc/*`）。`as const` は既存コードで使われている唯一の例外
  （`button.tsx` の `BUTTON_VARIANT`）— 同じ形なら可
- 失敗するテストを先に書く（red → green）。`.claude/skills/qrcc-tdd/SKILL.md`。テストは `bun test`（`bun:test` + `@testing-library/react`、
  `shared/ui/src/components/skip-link.test.tsx` の書き方）
- CSS: `.claude/skills/qrcc-html-a11y/references/css-modern.md`。**新しく書く宣言は `var(--rd-*)` を直接使う**（`--qrcc-*` を足さない。
  `tokens.test.ts` が落ちる）。論理プロパティ（`inline-size` / `margin-block`）。hover は `@media (hover: hover)` の中
- AAA を崩さない: 本文 7:1、UI 境界 3:1、対象 44px、フォーカスリング 2px 以上。色だけで状態を表さない
- 触ってよいパス（`scripts/lanes.tsv` の `feat/mado-ui`）: `shared/ui/**`, `vendor/riml-ds/**`, `scripts/vendor-riml-ds.sh`, `bun.lock`,
  `docs/adr/0012-mado-look.md`（新規）, `docs/adr/README.md`（行を 1 つ足す）, `e2e/tests/mado.spec.ts`（新規）
- 触らない: `features/**`, `apps/**`, `.github/**`, `plans/README.md`, `CLAUDE.md`, `.claude/**`, 他の `docs/**`
- riml-ds のリポジトリ（`/Users/riml/orca/projects/riml-ds`）は **読むだけ**。実行してよいのは Step 1 の `bun pm pack --destination …`
  （スクリプト経由）だけ。riml-ds で `git` 操作・編集・`bun install`・`bun run build` をしない。dist が無ければ STOP して報告
- `/Users/riml/orca/projects/noter` に触らない。デプロイ・公開・`gh`・push をしない
- コミットは Conventional Commits（lefthook の `commit-msg`）。コミット前に `bun run check`。Step ごとにコミットする

## 現状（抜粋）

`shared/ui/src/styles/index.css`（全文）:

```css
@layer rd.tokens, reset, tokens, base, components, utilities;

@import '@rimltempest/riml-ds-tokens/tokens.css';
@import '@rimltempest/riml-ds-tokens/themes/qrcc.css';
@import './tokens.css' layer(tokens);
@import './reset.css' layer(reset);
@import './base.css' layer(base);
@import './components.css' layer(components);
@import './utilities.css' layer(utilities);
@import './print.css';
```

`shared/ui/package.json` の依存: `"@rimltempest/riml-ds-tokens": "file:../../vendor/riml-ds/rimltempest-riml-ds-tokens-0.1.0.tgz"`。
`vendor/riml-ds/` には `rimltempest-riml-ds-tokens-0.1.0.tgz` と `SOURCE`（`riml-ds 39c5698`）。

`shared/ui/src/styles/tokens.css`: すべて `--qrcc-*: var(--rd-*)` の別名。生値で残しているのは
`--qrcc-radius-lg: 1.5rem`, `--qrcc-measure: 70ch`, `--qrcc-text-base/lg/xl/2xl`（`tokens.test.ts` の `KEPT_LOCAL` で固定）。

`shared/ui/src/styles/components.css`（189 行）: `.qrcc-skip-link`, `.qrcc-button`（`border-radius: var(--qrcc-radius)`, `border: 1px solid transparent`,
secondary は `surface-raised` + `border-strong`、disabled は `filter: grayscale(1); border-style: dashed`）, `.qrcc-field*`（`__control` は
`border: 1px solid var(--qrcc-border-strong)` の想定）, `.qrcc-live-region`, `.qrcc-theme-toggle`（fieldset、`border-radius: var(--qrcc-radius-lg)`）。

`shared/ui/src/styles/base.css`: `h1 { font-size: clamp(…) }`, `h2 { font-size: var(--qrcc-text-2xl) }` … に `font-family` は無い。`hr` の規則も無い。

`shared/ui/src/index.ts` の export: `Button`, `ButtonVariant`, `Field`, `LiveRegion`, `SkipLink`, `VisuallyHidden`, テーマ関連。

riml-ds 側（main、plan 015 以降）で参照するもの:

- `system/css/dist/patterns.css` — `@layer rd.components { .rd-window { … } .rd-window-title { … } .rd-window-body { … } [data-tone=…] … }`
  マークアップ: `<section class="rd-window"><h2 class="rd-window-title">題</h2><div class="rd-window-body">…</div></section>`。
  トーンは **見出し**に `data-tone="accent" | "warning" | "danger"`（`.rd-window-title[data-tone]`。section ではない）
- `library/elements/src/button/button.css`, `text-field/text-field.css`, `checkbox/checkbox.css`, `select/select.css` — 窓の言語で書き直された
  tier A の CSS。**qrcc の `.qrcc-*` セレクタに読み替えて写す**（riml-ds は `rd-button > button` のような要素セレクタ、qrcc はクラス）
- `system/tokens/dist/tokens.css` に `--rd-font-family-display`, `--rd-radius-lg: 1rem`, `--rd-radius-full`, `--rd-shadow-raised`,
  `--rd-shadow-overlay`, `--rd-type-heading-1` / `--rd-type-heading-2`（font ショートハンド）、`--rd-color-chrome-default` / `--rd-color-chrome-text`,
  `--rd-color-brand-primary` / `--rd-color-brand-signature`（**装飾専用。文字色に使わない**）

## Step 0 — レーンの確認

`grep -n '^feat/mado-ui' scripts/lanes.tsv` が 1 行返ること（計画者が足してある）。無ければ STOP。

## Step 1 — tarball を tokens + css の 2 つにする

`scripts/vendor-riml-ds.sh` を書き換える（tokens だけ → tokens と css）:

```bash
#!/usr/bin/env bash
# riml-ds が npm に公開されるまでのつなぎ。ローカルの riml-ds（ビルド済み）から
# tokens / css パッケージを tgz にして vendor/riml-ds/ に置く。公開後はこのスクリプトと vendor/ を消し、
# shared/ui/package.json の依存をバージョン指定に変える（docs/adr/0011-riml-ds-tokens.md）。
#
# 使い方: RIML_DS_DIR=/path/to/riml-ds bash scripts/vendor-riml-ds.sh && bun install
# （tgz が変わると bun.lock のハッシュも変わる。bun install を frozen 無しで回して bun.lock をコミットする）
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SRC="${RIML_DS_DIR:-$ROOT/../riml-ds}"
DEST="$ROOT/vendor/riml-ds"
PACKAGES=(system/tokens system/css)

for pkg in "${PACKAGES[@]}"; do
  [ -d "$SRC/$pkg/dist" ] \
    || { printf 'error: %s/%s/dist が無い。riml-ds 側で bun run build を先に実行する\n' "$SRC" "$pkg" >&2; exit 1; }
done
[ -f "$SRC/system/css/dist/patterns.css" ] \
  || { printf 'error: patterns.css が無い。riml-ds は plan 015 以降の main であること\n' >&2; exit 1; }

mkdir -p "$DEST"
rm -f "$DEST"/*.tgz
for pkg in "${PACKAGES[@]}"; do
  ( cd "$SRC/$pkg" && bun pm pack --destination "$DEST" --quiet >/dev/null )
done
printf 'riml-ds %s\n' "$(git -C "$SRC" rev-parse --short HEAD)" > "$DEST/SOURCE"
printf '==> %s\n' "$DEST"
ls -1 "$DEST"
```

実行: `RIML_DS_DIR=/Users/riml/orca/projects/riml-ds bash scripts/vendor-riml-ds.sh`
→ `vendor/riml-ds/rimltempest-riml-ds-tokens-<ver>.tgz`, `rimltempest-riml-ds-css-<ver>.tgz`, `SOURCE`。
`<ver>` は riml-ds の各 `package.json` の `version`（計画時は 0.2.0）。**古い 0.1.0 の tgz は消えていること**。

`shared/ui/package.json` の `dependencies` を出力されたファイル名に合わせる:

```json
  "dependencies": {
    "@qrcc/contract": "workspace:*",
    "@rimltempest/riml-ds-css": "file:../../vendor/riml-ds/rimltempest-riml-ds-css-<ver>.tgz",
    "@rimltempest/riml-ds-tokens": "file:../../vendor/riml-ds/rimltempest-riml-ds-tokens-<ver>.tgz"
  },
```

ルートで `bun install`（frozen 無し）→ `bun.lock` が更新される。続けて `bun install --frozen-lockfile` が exit 0。

**Verify**:

- `command ls node_modules/@rimltempest/riml-ds-css/dist/` に `patterns.css` がある
- `grep -c -- '--rd-font-family-display\|--rd-shadow-raised\|--rd-color-chrome-default' node_modules/@rimltempest/riml-ds-tokens/dist/tokens.css` → 3 以上
- `grep -c 'rd-window' node_modules/@rimltempest/riml-ds-css/dist/patterns.css` → 1 以上
- `bun test shared/ui` が通る（既存テストは tarball 更新だけでは落ちないはず。`tokens.test.ts` の
  「参照する --rd-* に定義がある」が落ちたら、riml-ds 側で名前が変わった変数がある → 表を作って STOP）

コミット: `chore(ui): vendor riml-ds tokens and css <ver>`

## Step 2 — テストを先に書く（red）

### 2a. `shared/ui/src/styles/tokens.test.ts` を更新

`KEPT_LOCAL` から `'--qrcc-radius-lg'` を消す（窓の角丸は riml-ds の lg = 1rem に揃える。1.5rem の「入れ子の同心」は、
窓ではタイトル帯が上の角を、padding が下の角を占めるので不要になった）。

### 2b. `shared/ui/src/styles/mado.test.ts` を新規作成（CSS をテキストで検査。`tokens.test.ts` と同じ道具）

```ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const read = (path: string | URL): string => readFileSync(path, 'utf8')
const indexCss = read(new URL('./index.css', import.meta.url))
const baseCss = read(new URL('./base.css', import.meta.url))
const componentsCss = read(new URL('./components.css', import.meta.url))
const patternsCss = read(Bun.resolveSync('@rimltempest/riml-ds-css/patterns.css', import.meta.dir))

// セレクタのブロック本文を取り出す（最初に一致したブロックだけ）
const block = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}

describe('窓（Mado）の見た目', () => {
  test('index.css は riml-ds の patterns.css を読み込み、rd.components を base より後・components より前に置く', () => {
    expect(indexCss).toContain("@import '@rimltempest/riml-ds-css/patterns.css';")
    const order =
      indexCss
        .match(/@layer ([^;]+);/)?.[1]
        ?.split(',')
        .map((s) => s.trim()) ?? []
    expect(order.indexOf('rd.components')).toBeGreaterThan(order.indexOf('base'))
    expect(order.indexOf('rd.components')).toBeLessThan(order.indexOf('components'))
  })

  test('riml-ds の patterns.css は .rd-window を提供する', () => {
    expect(patternsCss).toContain('.rd-window')
    expect(patternsCss).toContain('.rd-window-title')
  })

  test('h1/h2 は丸ゴシック系の display 書体、hr は点線', () => {
    expect(block(baseCss, 'h1')).toContain('font-family: var(--rd-font-family-display)')
    expect(block(baseCss, 'h2')).toContain('font-family: var(--rd-font-family-display)')
    expect(block(baseCss, 'hr')).toMatch(/dotted/)
  })

  test('ボタンはピルで太字、枠線なし', () => {
    const button = block(componentsCss, '.qrcc-button')
    expect(button).toContain('border-radius: var(--rd-radius-full)')
    expect(button).toContain('font-weight: var(--rd-font-weight-bold)')
    expect(button).not.toContain('border: 1px solid transparent')
  })

  test('secondary は沈んだ面の塗り', () => {
    expect(block(componentsCss, ".qrcc-button[data-variant='secondary']")).toContain(
      'var(--qrcc-surface-sunken)',
    )
  })

  test('無効は色以外でも分かる（枠線が無くなっても）', () => {
    const disabled = componentsCss.slice(componentsCss.indexOf('.qrcc-button:disabled'))
    expect(disabled).toMatch(/outline|text-decoration|border/)
  })

  test('forced-colors でボタンの境界が復元される', () => {
    const fc = componentsCss.slice(componentsCss.indexOf('@media (forced-colors: active)'))
    expect(fc).toMatch(/\.qrcc-button[\s\S]*?border(-color)?: .*ButtonText/)
  })

  test('brand 色を文字色に使っていない', () => {
    for (const css of [baseCss, componentsCss]) {
      for (const line of css.split('\n')) {
        if (line.includes('rd-color-brand')) expect(line).not.toMatch(/^\s*color:/)
      }
    }
  })

  test('生の色（oklch / hex）を書いていない', () => {
    for (const css of [baseCss, componentsCss]) {
      expect(css).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b/i)
    }
  })
})
```

### 2c. `shared/ui/src/components/window.test.tsx` を新規作成

```tsx
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Window } from './window.tsx'

afterEach(cleanup)

describe('Window', () => {
  test('題をアクセシブル名に持つ region として描画される', () => {
    render(<Window title="読み取り結果">中身</Window>)
    const region = screen.getByRole('region', { name: '読み取り結果' })
    expect(region.className).toBe('rd-window')
    expect(screen.getByRole('heading', { level: 2, name: '読み取り結果' }).className).toBe(
      'rd-window-title',
    )
    expect(region.querySelector('.rd-window-body')?.textContent).toBe('中身')
  })

  test('見出しの段は変えられる', () => {
    render(
      <Window title="詳細" headingLevel={3}>
        x
      </Window>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '詳細' })).toBeDefined()
  })

  test('トーンは見出し（帯）の data-tone で渡し、既定では付かない', () => {
    render(
      <Window title="注意" tone="warning">
        x
      </Window>,
    )
    expect(screen.getByRole('heading', { name: '注意' }).dataset['tone']).toBe('warning')
    cleanup()
    render(<Window title="ふつう">x</Window>)
    expect(screen.getByRole('heading', { name: 'ふつう' }).dataset['tone']).toBeUndefined()
  })

  test('id を渡すとその id が section に付き、aria-labelledby は見出しを指す', () => {
    render(
      <Window title="題" id="result">
        x
      </Window>,
    )
    const region = screen.getByRole('region', { name: '題' })
    expect(region.id).toBe('result')
    const labelledBy = region.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelledBy)?.textContent).toBe('題')
  })
})
```

`bun test shared/ui` → 2b・2c が **red**（`window.tsx` が無い、patterns.css の import が無い、など）であることを確認。
コミット: `test(ui): add red tests for the mado look`

## Step 3 — CSS

### 3a. `index.css` — 層の順序と patterns.css

```css
@layer reset, base, rd.tokens, rd.components, tokens, components, utilities;

@import '@rimltempest/riml-ds-tokens/tokens.css';
@import '@rimltempest/riml-ds-tokens/themes/qrcc.css';
@import '@rimltempest/riml-ds-css/patterns.css';
@import './tokens.css' layer(tokens);
@import './reset.css' layer(reset);
@import './base.css' layer(base);
@import './components.css' layer(components);
@import './utilities.css' layer(utilities);
@import './print.css';
```

なぜこの順か（先頭コメントにも書く）: `patterns.css` は自分で `@layer rd.components { … }` に包まれている。`rd.*` は `rd` 層の中の副層なので、
`rd` 層の位置（最初に現れた場所）で並ぶ。qrcc の `reset`（`* { margin: 0 }` など）と `base`（`h2 { font-size }`、見出しの `margin-block`）が
`.rd-window-title` に勝ってしまわないよう、`rd` は `reset` と `base` の**後**に置く。`components`（qrcc の部品）と `utilities` は
`.rd-window` の上に重ねたいので `rd` の**後**。変数だけの `rd.tokens` / `tokens` は順序に意味が無い。

### 3b. `base.css`

- `h1`, `h2` に `font-family: var(--rd-font-family-display);` を足す（h3/h4 は本文書体のまま — riml-ds の決まり）
- 新規:
  ```css
  /* 区切りは点線。窓の中で本文を分けるときに使う */
  hr {
    border: 0;
    border-block-start: 0.125rem dotted var(--rd-color-border-default);
    margin-block: var(--rd-space-6);
  }
  ```
- `body` の `background` は `--qrcc-surface` のまま（テーマ qrcc の地）。**変えない**

### 3c. `components.css` — riml-ds の tier A CSS を写す

riml-ds main の `library/elements/src/button/button.css` を読み、宣言を `.qrcc-button` に写す。写す前に riml-ds の値を読んで
**この計画の指示と食い違う点があれば riml-ds を正とし、下の表を `plans/README.md` 用のメモに残して報告する**。

`.qrcc-button`（置き換える宣言）:

| 宣言                  | 旧                                      | 新                                              |
| --------------------- | --------------------------------------- | ----------------------------------------------- |
| `border`              | `1px solid transparent`                 | `0`（細い枠線は無し。forced-colors で復元）     |
| `border-radius`       | `var(--qrcc-radius)`                    | `var(--rd-radius-full)`                         |
| `font-weight`         | （無し）                                | `var(--rd-font-weight-bold)`                    |
| `padding-inline`      | `var(--qrcc-space-4)`                   | `var(--rd-space-6)`（ピルは横に余白が要る）     |
| `transition-property` | `background-color, border-color, scale` | `background-color, translate`                   |
| `:active` の手応え    | `scale: 0.96`                           | `translate: 0 0.0625rem`（影の方向に 1px 沈む） |

- `[data-variant='secondary']`: `background: var(--qrcc-surface-sunken); color: var(--qrcc-text); border-color` は消す
- `[data-variant='primary']` / `['danger']` は塗りそのまま
- disabled: `filter: grayscale(1)` は残し、`border-style: dashed` の代わりに
  `outline: 0.125rem dashed currentColor; outline-offset: -0.375rem;`（枠線が無くなっても「押せない」が形で分かる。
  `:focus-visible` の outline とは競合するので `:focus-visible` を `:not(:disabled)` に限らず、フォーカス時は focus ring を優先させる —
  `.qrcc-button:disabled:focus-visible { outline: var(--qrcc-focus-width) solid var(--qrcc-focus-ring); outline-offset: var(--qrcc-focus-offset); }`
  を足す。aria-disabled はフォーカスできるので必要）
- `@media (forced-colors: active) { .qrcc-button { border: 0.0625rem solid ButtonText; } }`
- 動きを減らす設定: `translate` も `utilities.css` の一括指定（`prefers-reduced-motion`）に含まれているか確認。含まれていなければ
  `.qrcc-button:active` を `@media (prefers-reduced-motion: no-preference)` で包む

`.qrcc-field__control`（入力欄 = 井戸）: riml-ds `text-field.css` を写す。`background: var(--qrcc-surface-raised)`、
`border: 0.0625rem solid var(--qrcc-border)`、`border-radius: var(--rd-radius-md)`、`box-shadow: inset 0 0.0625rem 0 var(--qrcc-border)`
（浅い井戸。riml-ds が別の値ならそれに従う）。`[aria-invalid='true']` の枠は `--qrcc-danger` のまま。

`.qrcc-theme-toggle`（fieldset）: 窓の中の**セグメント**として見せる。`border: 0; padding: 0; border-radius` は消し、
`label` を `border-radius: var(--rd-radius-full); padding-inline: var(--rd-space-3)`、`:has(input:checked)` の label に
`background: var(--qrcc-surface-sunken)` を付ける（色だけに頼らない: ラジオの丸自体が状態を示す）。

`.qrcc-live-region`, `.qrcc-skip-link`: 触らない。

`bun test shared/ui` → 2b が green。コミット: `feat(ui): restyle buttons, fields and toggles in the mado look`

## Step 4 — `<Window>` 部品

`shared/ui/src/components/window.tsx` を新規作成:

```tsx
import { useId, type ReactNode } from 'react'

const WINDOW_TONE = {
  accent: 'accent',
  warning: 'warning',
  danger: 'danger',
} as const

export type WindowTone = (typeof WINDOW_TONE)[keyof typeof WINDOW_TONE]

type WindowProps = {
  /** タイトル帯の文言。そのまま region のアクセシブル名になる */
  readonly title: ReactNode
  /** 見出しの段。ページの見出し構造に合わせる（既定 2） */
  readonly headingLevel?: 2 | 3 | 4
  /** 帯の色。既定は灰茶色（chrome）。danger は破壊的操作の窓だけ */
  readonly tone?: WindowTone
  readonly id?: string
  readonly children: ReactNode
}

/**
 * 窓（Mado）。riml-ds の `.rd-window`（@rimltempest/riml-ds-css/patterns.css）をそのまま使う。
 * トーン（帯の色）は riml-ds の決まりで見出し側の data-tone が受ける。
 * 長い題を 1 行で切りたいときは title を <span> で渡す（素のテキストには text-overflow が効かない）。
 * `<section aria-labelledby>` なので支援技術には「region: <題>」として見える。
 * 題の無い箱が要るなら Window ではなく普通の div を使う（帯だけの窓は作らない）。
 */
export const Window = ({ title, headingLevel = 2, tone, id, children }: WindowProps) => {
  const titleId = useId()
  const Heading = `h${headingLevel}` satisfies 'h2' | 'h3' | 'h4'
  return (
    <section className="rd-window" id={id} aria-labelledby={titleId}>
      <Heading className="rd-window-title" id={titleId} data-tone={tone}>
        {title}
      </Heading>
      <div className="rd-window-body">{children}</div>
    </section>
  )
}
```

`satisfies` で `as` を避ける。`Heading` を JSX タグにするには文字列リテラル型で十分（React 19 の型で `'h2' | 'h3' | 'h4'` は intrinsic）。
oxlint が `satisfies` 経由の型を弾く場合は、`headingLevel` ごとに `if` で 3 分岐して返す（`as` は使わない）。

`shared/ui/src/index.ts` に追加（アルファベット順の位置、`VisuallyHidden` の後）:

```ts
export { Window } from './components/window.tsx'
export type { WindowTone } from './components/window.tsx'
```

`bun test shared/ui` → 2c が green。コミット: `feat(ui): add Window component on riml-ds .rd-window`

## Step 5 — 実ブラウザで層の順序を確かめる（e2e）

`e2e/tests/mado.spec.ts` を新規作成。既存の `e2e/tests/*.spec.ts` の書き方（`test` / `expect` の import 元、`page.goto` の URL の作り方）に揃える。
トップページ（`/`）に窓はまだ無い（plan 012 で入る）ので、ここでは **CSS の勝ち負け**だけを確かめる:

```ts
test('riml-ds の窓の CSS が qrcc の base より強い', async ({ page }) => {
  await page.goto('/')
  const margin = await page.evaluate(() => {
    const section = document.createElement('section')
    section.className = 'rd-window'
    section.innerHTML = '<h2 class="rd-window-title">t</h2><div class="rd-window-body">b</div>'
    document.body.append(section)
    const title = section.querySelector('.rd-window-title')
    return title ? getComputedStyle(title).marginBlockStart : null
  })
  expect(margin).toBe('0px') // base.css の見出し margin（--qrcc-space-8）が勝っていたら 32px になる
})
```

`bun run e2e`（`@qrcc/e2e` の Playwright。dev サーバの起こし方は `e2e/playwright.config.ts` と既存 spec のとおり）で通す。
`bun run a11y` は axe の spec だけを回すので、これとは別。

## Step 6 — ADR とチェック

`docs/adr/0012-mado-look.md` を新規作成（形式は `0011-riml-ds-tokens.md` に揃える、日付 2026-09-08、状態 Accepted）。内容:

- 文脈: riml-ds がブランドと窓（Mado）を決めた（riml-ds ADR-0013 / `docs/brand.md`）
- 決定: (1) qrcc は**形と質感**（窓・ピル・硬い影・点線・丸ゴシック見出し）を riml-ds から取り、**色相は qrcc テーマのまま**
  （riml のクリーム地に変えるかは別の判断。テーマ 1 行で切り替えられる）; (2) 窓は `@rimltempest/riml-ds-css/patterns.css` の `.rd-window`
  を使い、React では `@qrcc/ui` の `<Window>` で包む; (3) `--qrcc-radius-lg` は riml-ds の lg（1rem）の別名にする（1.5rem の理由が消えた）;
  (4) 層の順序 `reset, base, rd.tokens, rd.components, tokens, components, utilities` とその理由
- 受け入れた視覚差分の表（ボタン角丸 0.75rem → ピル、影 なし → 硬い影、secondary 塗り、入力欄の井戸、見出し書体）
- 段階 2（部品 CSS を riml-ds から）に入ったこと。ADR-0011 の「段階 1」の記述はそのまま残す

`docs/adr/README.md` に行を足す。

```bash
bun run check && bun run test && bun run a11y
bun install --frozen-lockfile   # exit 0
```

コミット: `docs(adr): record the mado look adoption` → 最後に `plans/README.md` は触らず、レビュアーに報告。

## Done criteria（すべて機械で確認）

- `command ls vendor/riml-ds/` → tokens と css の tgz が 1 つずつ + `SOURCE`。0.1.0 の tgz は無い
- `grep -c 'file:../../vendor/riml-ds' shared/ui/package.json` → 2
- `bun install --frozen-lockfile` → exit 0
- `bun test shared/ui` → 全緑（`mado.test.ts` 9 件、`window.test.tsx` 4 件を含む）
- `grep -c 'KEPT_LOCAL' shared/ui/src/styles/tokens.test.ts` ≥ 1 かつ `grep -c "'--qrcc-radius-lg'" shared/ui/src/styles/tokens.test.ts` → 0
- `grep -n 'radius-lg' shared/ui/src/styles/tokens.css` → `--qrcc-radius-lg: var(--rd-radius-lg);`
- `grep -rn 'oklch(\|#[0-9a-fA-F]\{6\}' shared/ui/src/styles/base.css shared/ui/src/styles/components.css` → 0 件
- `grep -rn 'rd-color-brand' shared/ui/src | grep 'color:'` → 0 件
- `grep -c 'Window' shared/ui/src/index.ts` → 2
- `bun run check` / `bun run test` / `bun run a11y` / `bun run e2e` → すべて exit 0
- `git diff --name-only fc1896b..HEAD | grep -v '^shared/ui/\|^vendor/riml-ds/\|^scripts/vendor-riml-ds.sh$\|^bun.lock$\|^docs/adr/0012-mado-look.md$\|^docs/adr/README.md$\|^e2e/tests/mado.spec.ts$'` → 空

## STOP conditions

- riml-ds main に `system/css/dist/patterns.css` が無い（plan 015 未了）
- `bun pm pack` が css パッケージで失敗する、または tgz の中に `dist/patterns.css` が無い
- `tokens.test.ts` の「参照する --rd-* に定義がある」が tarball 更新で落ちる（riml-ds 側の改名）— 落ちた名前を列挙して報告
- `bun run a11y` で新たな axe 違反（特にコントラスト）が出る — 違反の要素とルール名を報告。CSS を勘で直さない
- `.rd-window-title` の e2e で margin が 0 にならず、層の順序を変えても直らない
- 変更が `features/**` に波及しないと通せない（例: feature の CSS が `.qrcc-button` の `border` を上書きしている）— 該当ファイルと行を報告して STOP

## 保守メモ

- riml-ds の tarball を更新するたび `bun install`（frozen 無し）で `bun.lock` を更新してコミットする。npm 公開後は
  `shared/ui/package.json` の 2 行をバージョン指定にし、`vendor/riml-ds` と `scripts/vendor-riml-ds.sh` を消す（ADR-0011 §3）
- `components.css` は riml-ds の tier A CSS の**写し**。riml-ds 側の `button.css` などが変わったら差分を追って写す。
  段階 3（Lit 要素の React ラッパーへの置き換え）で写しは消える
- `.rd-window` の見た目は riml-ds の `patterns.css` が正。qrcc 側で `.rd-window*` を上書きしない（差分は riml-ds に出す）
- 新しい `--qrcc-*` を足さない。新しい CSS は `--rd-*` を直接使う
