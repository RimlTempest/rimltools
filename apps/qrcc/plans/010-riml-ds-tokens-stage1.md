# 010: デザイントークンを riml-ds から取る（段階 1: `--qrcc-*` を `--rd-*` の別名にする）

**優先度**: P2　**規模**: M　**依存**: —（riml-ds 側は plan 013 まで main に入っていること）　**レーン**: `feat/riml-ds-tokens`
**計画時の main**: `c2d4e3b`

> **Drift check（最初に実行）**:
> `git diff --stat c2d4e3b..HEAD -- shared/ui services/web/src/styles features/*/ui/*.css scripts/lanes.tsv`
> 差分が出たら内容を読む。`shared/ui/src/styles/tokens.css` に新しい `--qrcc-*` が増えていたら、Step 3 の表に**同じ規則で**行を足してから進める。

## なぜ

qrcc と noter の見た目の共通部分を、別リポジトリのデザインシステム **riml-ds**
（`/Users/riml/orca/projects/riml-ds`、npm `@rimltempest/riml-ds-*`）に集めることにした。移行の手順は riml-ds の
`docs/migration.md` にあり、**段階 1 はトークンだけ**: riml-ds の `tokens.css` と `themes/qrcc.css` を読み込み、
既存の `--qrcc-*` を `--rd-*` の別名にする。**アプリの CSS（`features/*/ui/*.css`）は 1 行も触らない。**
以後、新しく書く CSS は `--rd-*` を直接使い、`--qrcc-*` の数を減らしていく。

riml-ds 側には qrcc の色を写したテーマ `themes/qrcc`（青いアクセント hue 255、中性色 hue 265）がある（riml-ds plan 013）。
値の対応と、意図的に残す差は Step 3 の表にすべて書いてある。

### 取り込み方（重要）

riml-ds のパッケージは **まだ npm に公開されていない**（公開はオーナーの手作業）。公開を待たずに始めるため、
`vendor/riml-ds/*.tgz` に `bun pm pack` した tarball を置き、`file:` 依存で取り込む。**公開されたら
`shared/ui/package.json` の 1 行を `"@rimltempest/riml-ds-tokens": "<version>"` に変えて `vendor/` を消すだけ**で、
CSS 側の import 文は変わらない（`@rimltempest/riml-ds-tokens/tokens.css` という指定子は同じ）。

`bun install --frozen-lockfile` は `file:` tarball を lockfile の整合性ハッシュ付きで扱える（検証済み: bun 1.4.0）。
CI（`.github/workflows/ci.yml` / `deploy.yml`）はリポジトリ内の tgz を読むだけなので、ネットワークも認証も要らない。

## リポジトリの決まり（守る）

- `any` / `as` / `!` / `class` / `enum` を書かない（`.oxlintrc.json` の `qrcc/*`）。テストは `bun test`（`bun:test`）で、
  `shared/ui/src/theme/theme.test.ts` の書き方に揃える（`describe` / `test` / `expect`）
- 失敗するテストを先に書く（red → green）。`.claude/skills/qrcc-tdd/SKILL.md`
- CSS の方針: `.claude/skills/qrcc-html-a11y/references/css-modern.md`。`@layer` の順序は `shared/ui/src/styles/index.css` が宣言する
- 触ってよいパス（`scripts/lanes.tsv` の `feat/riml-ds-tokens`）: `shared/ui/src/styles/**`, `shared/ui/package.json`,
  `vendor/riml-ds/**`, `scripts/vendor-riml-ds.sh`, `bun.lock`, `docs/adr/0011-riml-ds-tokens.md`, `docs/adr/README.md`（行を 1 つ足す）
- 触らない: `features/**`, `apps/**`, `shared/ui/src/components/**`, `shared/ui/src/theme/**`, `.github/**`, `plans/README.md`,
  `CLAUDE.md`, `.claude/**`, 他の `docs/**`
- riml-ds のリポジトリは **読むだけ**。実行してよいのは Step 1 の `bun pm pack --destination …` だけ（生成物は qrcc 側の
  `vendor/` に出る）。riml-ds で `git` 操作・ファイル編集・`bun install`・`bun run build` をしない。dist が無ければ STOP して報告
- コミットは Conventional Commits（lefthook の `commit-msg`）。コミット前に `bun run check`

## 現状（抜粋）

`shared/ui/src/styles/index.css`:

```css
@layer reset, tokens, base, components, utilities;

@import './tokens.css' layer(tokens);
@import './reset.css' layer(reset);
@import './base.css' layer(base);
@import './components.css' layer(components);
@import './utilities.css' layer(utilities);
@import './print.css';
```

`shared/ui/src/styles/tokens.css`: `:root { color-scheme: light dark; --qrcc-surface: light-dark(oklch(1 0 0), oklch(0.18 0.012 265)); … }`
に色 17 個（すべて `light-dark(oklch, oklch)`）、寸法・型・フォント 21 個。末尾に
`:root[data-theme='light'] { color-scheme: light }` / `:root[data-theme='dark'] { color-scheme: dark }`（**これは残す**。テーマ切替の仕組み）。

`shared/ui/package.json`: `"dependencies": { "@qrcc/contract": "workspace:*" }`、exports に `"./styles.css": "./src/styles/index.css"`。

riml-ds の `tokens.css` は `@layer rd.tokens { :root { color-scheme: light dark; --rd-…: …; } }` の形で、`themes/qrcc.css` は
`@layer rd.tokens { :root { --rd-color-palette-…: oklch(…); } }`（palette の差し替えだけ。semantic は `var()` で palette を参照しているので
ライト・ダーク両方が追随する）。

## Step 1 — tarball を vendor に置く

`scripts/vendor-riml-ds.sh` を新規作成（実行権限を付ける）:

```bash
#!/usr/bin/env bash
# riml-ds が npm に公開されるまでのつなぎ。ローカルの riml-ds（ビルド済み）から
# tokens パッケージを tgz にして vendor/riml-ds/ に置く。公開後はこのスクリプトと vendor/ を消し、
# shared/ui/package.json の依存をバージョン指定に変える（docs/adr/0011-riml-ds-tokens.md）。
#
# 使い方: RIML_DS_DIR=/path/to/riml-ds bash scripts/vendor-riml-ds.sh && bun install
# （tgz が変わると bun.lock のハッシュも変わる。bun install を frozen 無しで回して bun.lock をコミットする）
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SRC="${RIML_DS_DIR:-$ROOT/../riml-ds}"
DEST="$ROOT/vendor/riml-ds"

[ -f "$SRC/system/tokens/dist/tokens.css" ] \
  || { printf 'error: %s/system/tokens/dist が無い。riml-ds 側で bun run build を先に実行する\n' "$SRC" >&2; exit 1; }

mkdir -p "$DEST"
rm -f "$DEST"/*.tgz
( cd "$SRC/system/tokens" && bun pm pack --destination "$DEST" --quiet >/dev/null )
printf 'riml-ds %s\n' "$(git -C "$SRC" rev-parse --short HEAD)" > "$DEST/SOURCE"
printf '==> %s\n' "$DEST"
ls -1 "$DEST"
```

実行: `RIML_DS_DIR=/Users/riml/orca/projects/riml-ds bash scripts/vendor-riml-ds.sh`
→ `vendor/riml-ds/rimltempest-riml-ds-tokens-0.1.0.tgz` と `vendor/riml-ds/SOURCE` ができる（ファイル名の版は riml-ds 側の
`system/tokens/package.json` の `version` に従う。違っていたら以下の `file:` パスも合わせる）。

`shared/ui/package.json` の `dependencies` に追加（`file:` は **この package.json からの相対**）:

```json
  "dependencies": {
    "@qrcc/contract": "workspace:*",
    "@rimltempest/riml-ds-tokens": "file:../../vendor/riml-ds/rimltempest-riml-ds-tokens-0.1.0.tgz"
  },
```

ルートで `bun install`（frozen 無し）→ `bun.lock` が更新される。続けて `bun install --frozen-lockfile` が exit 0 になることを確認。

`.gitignore` は触らない（`vendor/` は ignore されていない。`dist/` は ignore されているが tgz の中身は展開しないので無関係）。

**Verify**:

- `command ls node_modules/@rimltempest/riml-ds-tokens/dist/` に `tokens.css` `themes/` がある
- `grep -c -- '--rd-color-palette' node_modules/@rimltempest/riml-ds-tokens/dist/themes/qrcc.css` → 18（riml-ds plan 013 の成果。0 なら riml-ds が 013 以前なので **STOP**）
- `grep -c -- '--rd-color-surface-hover\|--rd-color-status-danger-hover' node_modules/@rimltempest/riml-ds-tokens/dist/tokens.css` → 2

## Step 2 — テストを先に書く（red）

`shared/ui/src/styles/tokens.test.ts` を新規作成。CSS をテキストとして読み、正規表現で検査する（パーサは要らない）。

```ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Glob } from 'bun'

const root = new URL('../../../../', import.meta.url)
const read = (path: string | URL): string => readFileSync(path, 'utf8')

const tokensCss = read(new URL('./tokens.css', import.meta.url))
const rdTokensCss = read(Bun.resolveSync('@rimltempest/riml-ds-tokens/tokens.css', import.meta.dir))
const rdThemeCss = read(
  Bun.resolveSync('@rimltempest/riml-ds-tokens/themes/qrcc.css', import.meta.dir),
)

const defined = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`(${prefix}[a-z0-9-]+)\\s*:`, 'g'))].map((m) => m[1] ?? ''))
const used = (css: string, prefix: string): ReadonlySet<string> =>
  new Set([...css.matchAll(new RegExp(`var\\((${prefix}[a-z0-9-]+)`, 'g'))].map((m) => m[1] ?? ''))

// 部品の中で style 属性から与える変数。tokens.css には無くてよい
const COMPONENT_LOCAL = /^--qrcc-(sheet|cell)-/

// 段階 1 で意図的に riml-ds に寄せない qrcc 固有のトークン（値の理由は docs/adr/0011-riml-ds-tokens.md）
const KEPT_LOCAL: readonly string[] = [
  '--qrcc-radius-lg',
  '--qrcc-measure',
  '--qrcc-text-base',
  '--qrcc-text-lg',
  '--qrcc-text-xl',
  '--qrcc-text-2xl',
]

const appCssFiles = (): readonly string[] =>
  [
    ...new Glob('{shared/ui/src,features/*/ui,services/web/src}/**/*.css').scanSync(root.pathname),
  ].toSorted()

describe('デザイントークンは riml-ds の別名', () => {
  test('tokens.css に色のリテラルが残っていない（すべて --rd-* の別名）', () => {
    expect(tokensCss).not.toMatch(/oklch\(/)
    expect(tokensCss).not.toMatch(/light-dark\(/)
  })

  test('tokens.css が参照する --rd-* は riml-ds の tokens.css か themes/qrcc.css に定義がある', () => {
    const rd = new Set([...defined(rdTokensCss, '--rd-'), ...defined(rdThemeCss, '--rd-')])
    const missing = [...used(tokensCss, '--rd-')].filter((name) => !rd.has(name))
    expect(missing).toEqual([])
  })

  test('生の値で残す --qrcc-* は KEPT_LOCAL の 6 つだけ', () => {
    const raw = [...tokensCss.matchAll(/(--qrcc-[a-z0-9-]+)\s*:\s*(?!var\(--rd-)/g)].map(
      (m) => m[1] ?? '',
    )
    expect(raw.toSorted()).toEqual([...KEPT_LOCAL].toSorted())
  })

  test('アプリの CSS が使う --qrcc-* はすべて tokens.css に定義がある', () => {
    const names = defined(tokensCss, '--qrcc-')
    const missing = appCssFiles()
      .flatMap((file) => [...used(read(new URL(file, root)), '--qrcc-')])
      .filter((name) => !names.has(name) && !COMPONENT_LOCAL.test(name))
    expect([...new Set(missing)]).toEqual([])
  })

  test('テーマの明示選択（data-theme）は残っている', () => {
    expect(tokensCss).toContain(":root[data-theme='light']")
    expect(tokensCss).toContain(":root[data-theme='dark']")
  })
})
```

（`m[1] ?? ''` は `!` を使わずに `undefined` を潰す書き方。`Glob` は Bun 組み込み。`Bun.resolveSync` の第 2 引数は起点ディレクトリ。
`root.pathname` が URL エンコードされて困る環境なら `fileURLToPath(root)` にする。書き方はレーンの `qrcc-typescript` skill に従う。）

`bun test shared/ui/src/styles` → 1・3 番目が **fail**（現状は oklch がある / 生の値が 38 個）。4・5 番目は今でも通る（回帰防止）。

## Step 3 — tokens.css を別名にする（green）

`shared/ui/src/styles/tokens.css` を書き換える。**変数名は 1 つも変えない・消さない**（アプリ CSS を触らないため）。
ファイル先頭のコメントは「riml-ds の別名。新しい CSS は `--rd-*` を直接使う。対応表と残した差は ADR-0011」に書き換える。

| `--qrcc-*`                                       | 値                                                          | 備考                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `surface`                                        | `var(--rd-color-surface-default)`                           |                                                                                                 |
| `surface-raised`                                 | `var(--rd-color-surface-raised)`                            |                                                                                                 |
| `surface-sunken`                                 | `var(--rd-color-surface-sunken)`                            | ダークが 0.14 → 0.18（既知の差）                                                                |
| `surface-hover`                                  | `var(--rd-color-surface-hover)`                             | ライトが 0.93 → 0.945（既知の差）                                                               |
| `text`                                           | `var(--rd-color-text-default)`                              | ライト 0.2 → 0.24 / ダーク 0.955 → 1.0（既知の差、いずれも 16:1 以上）                          |
| `text-muted`                                     | `var(--rd-color-text-muted)`                                |                                                                                                 |
| `accent`                                         | `var(--rd-color-accent-default)`                            |                                                                                                 |
| `accent-hover`                                   | `var(--rd-color-accent-hover)`                              |                                                                                                 |
| `on-accent`                                      | `var(--rd-color-text-on-accent)`                            |                                                                                                 |
| `danger`                                         | `var(--rd-color-status-danger-default)`                     |                                                                                                 |
| `danger-hover`                                   | `var(--rd-color-status-danger-hover)`                       |                                                                                                 |
| `on-danger`                                      | `var(--rd-color-text-on-status)`                            |                                                                                                 |
| `success`                                        | `var(--rd-color-status-success-default)`                    |                                                                                                 |
| `border`                                         | `var(--rd-color-border-default)`                            | **ライト 0.72 → 0.6**。旧値は白地に 2.48:1 で WCAG 1.4.11（3:1）を割っていた。ダーク 0.48 → 0.6 |
| `border-strong`                                  | `var(--rd-color-border-strong)`                             | ライト 0.55 → 0.415 / ダーク 0.66 → 0.79                                                        |
| `focus-ring`                                     | `var(--rd-color-focus-ring)`                                | accent と同じ色になる（旧値は彩度だけ高かった）                                                 |
| `space-1` … `space-8`                            | `var(--rd-space-1)` … `var(--rd-space-8)`                   | 値は同じ（0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 rem）                                                 |
| `radius`                                         | `var(--rd-radius-md)`                                       | 0.5rem 同じ                                                                                     |
| `radius-sm`                                      | `var(--rd-radius-sm)`                                       | 0.25rem 同じ                                                                                    |
| `radius-lg`                                      | `1.5rem`（**残す**）                                        | riml-ds の lg は 0.75rem。入れ子の角丸（外 = 内 + padding）の理由で qrcc 固有                   |
| `target-min`                                     | `var(--rd-sizing-target-min)`                               | 2.75rem = 44px                                                                                  |
| `focus-width`                                    | `var(--rd-focus-ring-width)`                                | 3px 同じ                                                                                        |
| `focus-offset`                                   | `var(--rd-focus-ring-offset)`                               | 2px 同じ                                                                                        |
| `measure`                                        | `70ch`（**残す**）                                          | riml-ds は 80ch。qrcc は日本語の読みやすさで 70 を選んでいる                                    |
| `text-sm`                                        | `var(--rd-type-small-font-size)`                            | 0.875rem 同じ                                                                                   |
| `text-base` / `text-lg` / `text-xl` / `text-2xl` | 各 `1rem` / `1.125rem` / `1.375rem` / `1.75rem`（**残す**） | riml-ds の本文は流動（clamp）、見出しは 2 段しかない。段階 3 で部品ごとに寄せる                 |
| `font-sans`                                      | `var(--rd-font-family-sans)`                                | `'Yu Gothic UI'` が落ちて `'Segoe UI', 'Roboto'` が入る（システムフォント。macOS では同じ）     |
| `font-mono`                                      | `var(--rd-font-family-mono)`                                |                                                                                                 |

`color-scheme: light dark;` の行は **消す**（riml-ds の tokens.css が `:root` に置く。二重定義しない）。
`:root[data-theme='light'] / [data-theme='dark']` の 2 ブロックは残す。

既存コメント（AAA の根拠など）は、別名にしても意味が残るものは残し、値の説明（「ライト 15.9:1」など）は消す。

`shared/ui/src/styles/index.css`:

```css
/*
 * @qrcc/ui のスタイル。1 枚にまとめてあるので、アプリは link を 1 本張るだけでよい
 * （コンポーネントごとの CSS import は SSR/RSC で読み込み順が不安定になるため使わない）。
 *
 * トークンは riml-ds（@rimltempest/riml-ds-tokens）。rd.tokens 層に --rd-* が入り、
 * tokens 層の --qrcc-* はその別名（docs/adr/0011-riml-ds-tokens.md）。
 *
 * 方針: .claude/skills/qrcc-html-a11y/references/css-modern.md
 */
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

（riml-ds の 2 ファイルは自分で `@layer rd.tokens { … }` に包んでいるので `layer()` を付けない。`@layer` 文で `rd.tokens` を先頭に
宣言しておくことで、後から読まれても最下位に置かれる。）

**Verify**:

- `bun test shared/ui/src/styles` → 5 passed
- `bun run --filter '@qrcc/web' build` → exit 0。`grep -c -- '--rd-color-palette-accent-600' services/web/dist/client/assets/*.css` → 1 以上
  （vite が `@import` を解決して 1 枚に畳んでいる）。`grep -c 'rd-color-surface-default' services/web/dist/client/assets/*.css` → 1 以上
- `bun run dev` を起こしてトップを開き（Playwright を使ってよい）、ライト・ダークで背景と本文とボタンの色が付いていることをスクリーンショットで確認する
  （目視用。真っ白・真っ黒・透明ボタンになっていたら `@import` の順序か `file:` の解決を疑う）

## Step 4 — a11y ゲート

```bash
bun run a11y
```

axe（AAA タグ込み）が両ページで green。`color-contrast` / `color-contrast-enhanced` の違反が出たら、
どの要素・どの色かを報告して **STOP**（値は riml-ds 側で直す）。

## Step 5 — ADR と索引

`docs/adr/0011-riml-ds-tokens.md` を新規作成（本文は下のとおり。日付は実行日）:

```md
# ADR-0011: デザイントークンを riml-ds から取る

- 状態: Accepted
- 日付: 2026-09-07
- 関連: [ADR-0007](0007-feature-colocation.md)

## 文脈

qrcc と noter で同じ判断（AAA のコントラスト、44px の対象、3px のフォーカスリング、oklch のトークン）を
2 か所で保守していた。共通部分を別リポジトリ **riml-ds**（`@rimltempest/riml-ds-*`、DTCG トークン +
Web Components + 各フレームワークのラッパー）に集め、アプリはそれを使う側になる。

## 決定

1. トークンの正は riml-ds の `@rimltempest/riml-ds-tokens`。qrcc のブランド色は riml-ds の `themes/qrcc`
   （palette の差し替え）として riml-ds 側に置く。
2. 段階的に移す（riml-ds `docs/migration.md`）。段階 1（この ADR）はトークンだけ: `--qrcc-*` を `--rd-*` の
   別名にし、アプリの CSS は触らない。以後の新しい CSS は `--rd-*` を直接使う。
3. riml-ds が npm に公開されるまで、`vendor/riml-ds/*.tgz` を `file:` 依存で取り込む
   （`scripts/vendor-riml-ds.sh`）。公開後は `shared/ui/package.json` をバージョン指定に変え、`vendor/` と
   スクリプトを消す。
4. 段階 1 で riml-ds に寄せなかったもの（`shared/ui/src/styles/tokens.test.ts` の `KEPT_LOCAL`）:
   `--qrcc-radius-lg`（1.5rem。入れ子の角丸）、`--qrcc-measure`（70ch）、`--qrcc-text-base/lg/xl/2xl`
   （riml-ds の見出しは 2 段・本文は流動。部品を置き換える段階 3 で寄せる）。

## 受け入れた視覚差分

すべて AAA を満たす側への変化。

| トークン                        | 旧（light / dark）    | 新（light / dark）          | 理由                                                    |
| ------------------------------- | --------------------- | --------------------------- | ------------------------------------------------------- |
| `--qrcc-border`                 | 0.72 / 0.48           | 0.6 / 0.6                   | 旧ライト値は白地に 2.48:1 で 1.4.11 の 3:1 を割っていた |
| `--qrcc-border-strong`          | 0.55 / 0.66           | 0.415 / 0.79                | riml-ds は text-muted と同じ素材を使う                  |
| `--qrcc-text`                   | 0.2 / 0.955           | 0.24 / 1.0                  | palette の共有（16:1 以上のまま）                       |
| `--qrcc-surface-sunken`（dark） | 0.14                  | 0.18                        | 面と同じ素材                                            |
| `--qrcc-surface-hover`（light） | 0.93                  | 0.945                       | sunken と同じ素材                                       |
| `--qrcc-focus-ring`             | 彩度 0.2 / 0.16       | accent と同じ               |                                                         |
| `--qrcc-font-sans`              | 'Yu Gothic UI' を含む | 'Segoe UI', 'Roboto' を含む | システムフォント。macOS / iOS では同じ                  |

## 影響

- `bun install` は `vendor/riml-ds/*.tgz` を読む。tgz を更新したら frozen 無しの `bun install` で `bun.lock` も更新する
- `shared/ui/src/styles/tokens.test.ts` が「tokens.css に色のリテラルが無い」「参照する `--rd-*` が実在する」
  「生の値は `KEPT_LOCAL` だけ」を固定する。`--qrcc-*` を足すことはもうしない
- 段階 2（riml-ds の reset / base に切り替え）、段階 3（`rd-button` などの部品）は別 plan
```

`docs/adr/README.md` の表に行を足す: `| [0011](0011-riml-ds-tokens.md) | デザイントークンを riml-ds から取る（--qrcc-* は --rd-* の別名） | Accepted |`
（表の他の行の幅は触らない。oxfmt が markdown を整形するなら従う）。

## Done criteria

| コマンド                                                                      | 期待                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bun install --frozen-lockfile`                                               | exit 0                                                 |
| `bun run check`                                                               | exit 0                                                 |
| `bun test shared/ui/src/styles`                                               | 5 passed                                               |
| `bun run test`                                                                | 全 green（既存 + 5）                                   |
| `bun run --filter '@qrcc/web' build`                                          | exit 0                                                 |
| `grep -c 'rd-color-palette-accent-600' services/web/dist/client/assets/*.css` | ≥ 1                                                    |
| `grep -c 'oklch(' shared/ui/src/styles/tokens.css`                            | 0                                                      |
| `bun run a11y`                                                                | 全 green                                               |
| `git diff --stat main..HEAD -- features services/web/src`                     | 空（アプリの CSS / TSX は触っていない）                |
| `command ls vendor/riml-ds`                                                   | `SOURCE` と `rimltempest-riml-ds-tokens-*.tgz` の 2 つ |

## STOP 条件

- riml-ds の `system/tokens/dist` が無い、または `themes/qrcc.css` の palette 差し替えが 18 行でない（013 未マージ）
- `bun install --frozen-lockfile` が `file:` tarball で落ちる（エラーを全文報告）
- vite の build が `@rimltempest/riml-ds-tokens/tokens.css` を解決できない
- axe に `color-contrast*` の違反が出る
- Step 3 の表に無い `--qrcc-*` が tokens.css にある（Drift check で拾えなかったもの）

## 保守メモ

- tgz を更新する手順: riml-ds 側で `bun run build` → qrcc 側で `RIML_DS_DIR=… bash scripts/vendor-riml-ds.sh && bun install` → `bun.lock` と `vendor/` をコミット
- npm 公開後: `shared/ui/package.json` を `"@rimltempest/riml-ds-tokens": "x.y.z"` に、`vendor/riml-ds` と `scripts/vendor-riml-ds.sh` を削除、ADR-0011 の 3 に「公開済み」と追記
- 新しい色が要るときは **riml-ds に足す**（semantic か `themes/qrcc`）。qrcc の tokens.css に `--qrcc-*` を足さない（テストが落ちる）
- 段階 2 では `@rimltempest/riml-ds-css` を入れる。その tgz は `peerDependencies` に tokens の固定版を持つので、tokens も同じ版の tgz にする
