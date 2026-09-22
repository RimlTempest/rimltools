# 013: 窓の丸をボタンに・ダイアログを窓に・文字を riml-ds の typography に揃える

**優先度**: P1　**規模**: M　**依存**: 012（マージ済み）、riml-ds 017 / 018（両方 main にマージ済みであること）
**レーン**: `feat/mado-controls`　**計画時の main**: qrcc2 `6c84985`、riml-ds `da4200a`

> **Drift check（最初に実行）**:
>
> - `grep -c 'rd-window-bar' /Users/riml/orca/projects/riml-ds/system/css/src/patterns.css` が 1 以上、
>   `test -f /Users/riml/orca/projects/riml-ds/system/css/src/typography.css && test -f /Users/riml/orca/projects/riml-ds/system/css/src/atoms.css && echo OK`
>   が `OK`（riml-ds 017 / 018 がマージ済み）。どちらか欠けたら **STOP**（riml-ds 側が終わっていない）
> - `grep -n 'rd-window-title' shared/ui/src/components/window.tsx` が見出しに直接 `data-tone` を付けている（旧構造）こと。
>   既に `rd-window-bar` があれば誰かが先に直している → STOP
> - `git diff --stat 6c84985..HEAD -- shared/ui features/manage/ui` に差分があれば読む

## なぜ

plan 011 / 012 で qrcc の区画は riml-ds の窓（`.rd-window`）になった。その後 riml-ds 側で 2 つ決まった:

1. **窓の左端の丸は装飾ではなくボタン**（riml-ds ADR-0014、`docs/brand.md` §7.1）。帯の構造が
   「見出し = 帯」から「**帯 ⊃ 操作 + 見出し**」に変わり、`data-tone` の付け先も見出しから帯（`.rd-window-bar`）に移った。
   qrcc の `<Window>` は旧構造のままなので、riml-ds を上げると帯の色が消え、丸は出ない
2. **文字の型が `typography.css` に揃った**（riml-ds plan 018）。`--rd-type-heading-1..4` / `--rd-type-display` が
   トークンとして在るので、qrcc が `base.css` に手で書いている `h2..h4` の大きさ（`--qrcc-text-2xl` などの生値 4 つ）は不要になる

あわせて plan 012 の積み残しを片付ける:

- `.qrcc-manage-undo`（削除の取り消し）の板が窓になっていない
- `features/manage/ui/shared/shared-code-screen.tsx` の 2 つの `<section>` が窓になっていない（プレビューがページ面に直置き）
- `ConfirmDialog` が窓の骨格を持っていない（ダイアログ = 窓 + overlay 影、帯の左端の × が閉じる — brand.md §7.7）

## リポジトリの決まり（守る）

- `CLAUDE.md` の「絶対に守ること」。特に **`any` / `as` / `!` / `class` / `enum` を書かない**、**実装より先に失敗するテストを書く**
- スキル `.claude/skills/qrcc-typescript` / `qrcc-html-a11y` / `qrcc-tdd` を先に読む
- 触ってよいパス（`scripts/lanes.tsv` の `feat/mado-controls`）: `shared/ui/**`、`vendor/riml-ds/**`、`bun.lock`、
  `features/*/ui/**`、`e2e/tests/**`、`docs/adr/0012-mado-look.md`（表の追記のみ）
  **触らない**: `apps/**`、`.github/**`、`.claude/**`、`CLAUDE.md`、`plans/README.md`、`scripts/**`（`vendor-riml-ds.sh` を含む。
  動かなければ STOP）、`features/*/{contract,core,server,engine,worker}/**`
- riml-ds 本体（`/Users/riml/orca/projects/riml-ds`）は **読むだけ**。書き込み・git 操作をしない。唯一の例外は
  `scripts/vendor-riml-ds.sh` が中で実行する `bun pm pack --destination`（成果物は qrcc2 の `vendor/` に出る）
- 新しい `--qrcc-*` トークンを足さない（`shared/ui/src/styles/tokens.test.ts` が落ちる）。新しい CSS は `--rd-*` を直接使う
- コミットは Step ごと（Conventional Commits）。毎コミット `bun run check` 通過（red コミットは fmt + lint のみ可 — plan 011 の実行メモと同じ）

## 現状のコード（抜粋。読んでから触る）

`shared/ui/src/components/window.tsx`（旧構造。見出しが帯を兼ねている）:

```tsx
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

`shared/ui/src/styles/index.css` の import（`typography.css` / `atoms.css` はまだ無い）:

```css
@layer reset, base, rd.tokens, rd.components, tokens, components, utilities;

@import '@rimltempest/riml-ds-tokens/tokens.css';
@import '@rimltempest/riml-ds-tokens/themes/qrcc.css';
@import '@rimltempest/riml-ds-css/patterns.css';
```

`shared/ui/src/styles/base.css` 29–44 行（生値の見出しサイズ）:

```css
h1 {
  font-family: var(--rd-font-family-display);
  font-size: clamp(1.6rem, 1.4rem + 1vi, 2.2rem);
}
h2 {
  font-family: var(--rd-font-family-display);
  font-size: var(--qrcc-text-2xl);
}
h3 {
  font-size: var(--qrcc-text-xl);
}
h4 {
  font-size: var(--qrcc-text-lg);
}
```

`shared/ui/src/styles/tokens.test.ts` 23–29 行 `KEPT_LOCAL`（生値で残す `--qrcc-*` の一覧。減らしたらここも減らす）:
`'--qrcc-measure', '--qrcc-text-base', '--qrcc-text-lg', '--qrcc-text-xl', '--qrcc-text-2xl'`

`features/manage/ui/codes-screen.tsx` 320–326 行（取り消しの板）と `manage.css` 86–96 行（`.qrcc-manage-undo`）、
`features/manage/ui/confirm-dialog.tsx`（ネイティブ `<dialog>`、`className="qrcc-confirm-dialog"`、`<h2 id={titleId}>` 直置き）、
`features/manage/ui/shared/shared-code-screen.tsx` 137–160 行（`<section aria-labelledby>` × 2）。

riml-ds 側の **帯のマークアップ（正）**は `/Users/riml/orca/projects/riml-ds/docs/brand.md` §7.1 と
`/Users/riml/orca/projects/riml-ds/plans/017-window-controls.md` の「帯のマークアップ（CSS 版）」:

```html
<section class="rd-window" aria-labelledby="w1">
  <header class="rd-window-bar" data-tone="warning">
    <div class="rd-window-controls">
      <button
        type="button"
        class="rd-window-control"
        data-action="close"
        aria-label="閉じる"
      ></button>
      <button
        type="button"
        class="rd-window-control"
        data-action="collapse"
        aria-label="たたむ"
        aria-expanded="true"
        aria-controls="w1-body"
      ></button>
    </div>
    <h2 class="rd-window-title" id="w1">タイトル</h2>
  </header>
  <div class="rd-window-body" id="w1-body">…</div>
</section>
```

並びは左から **閉じる（×）・広げる（□）・たたむ（−）**。使わない操作の丸は**描かない**。1 つも無ければ `.rd-window-controls` ごと省く。

## 設計（決めてある。変えるなら STOP）

### `<Window>`（`shared/ui/src/components/window.tsx`）

| 項目         | 決定                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 構造         | `<section class="rd-window" aria-labelledby>` ⊃ `<header class="rd-window-bar" data-tone>` ⊃ （`<div class="rd-window-controls">` があれば）+ `<hN class="rd-window-title" id>` ／ `<div class="rd-window-body" id>`                                                                                                 |
| 新 props     | `onClose?: () => void`（あれば × を描く。`aria-label="閉じる"`）、`collapsible?: boolean`（あれば − を描く。押すと body に `hidden`、ボタン `aria-expanded` / `aria-controls={bodyId}`。**開閉は Window 内の `useState`**、既定は開いている）。`expand`（□）は qrcc では使わないので**描かない**（props も足さない） |
| tone         | `data-tone` は **`header.rd-window-bar` に付ける**（見出しには付けない）                                                                                                                                                                                                                                             |
| 帯の共有     | 帯（header 部分）は `WindowBar` として同ファイルで切り出し、`@qrcc/ui` から **export する**（`ConfirmDialog` が同じ帯を使う）。props: `title`, `titleId`, `headingLevel`, `tone`, `onClose?`, `collapse?: { expanded: boolean; controlsId: string; onToggle: () => void }`                                           |
| 記号         | ボタンの中身は空。× / − の絵は riml-ds の `patterns.css` が `mask` で描く（qrcc 側で SVG を持たない）                                                                                                                                                                                                                |
| 文言         | 日本語固定（qrcc は日本語 UI）: 閉じる / たたむ。たたんだ状態でも `aria-label` は「たたむ」のまま、`aria-expanded` で状態を伝える（ラベルを切り替えない）                                                                                                                                                            |
| ドキュメント | window.tsx の JSDoc を「トーンは帯（header）側」に直す                                                                                                                                                                                                                                                               |

### 適用先（この 4 つだけ。他の 13 か所の `<Window>` は props を変えない）

| 場所                                                           | 変更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codes-screen.tsx` の `.qrcc-manage-undo`                      | `<Window title="削除しました" headingLevel={2} tone="accent" onClose={() => setUndoable(undefined)}>` の中に「削除を取り消す」ボタン。`manage.css` の `.qrcc-manage-undo` は消す（板の装飾は窓が持つ）。× は「取り消せる状態を手で片付ける」操作 — 時間で消さない（AAA 2.2.6）のは変わらない                                                                                                                                                                                                                               |
| `codes-screen.tsx` の 「フォルダ」 窓                          | `collapsible` を付ける（一覧が長いとき畳める。既定は開いている）                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `shared-code-screen.tsx` の 2 つの `<section aria-labelledby>` | `<Window title="共有されたコード">` / `<Window title="このリンクでできること">` に置き換え、`useId` 2 つと `aria-labelledby` を消す                                                                                                                                                                                                                                                                                                                                                                                        |
| `confirm-dialog.tsx`                                           | `<dialog class="qrcc-confirm-dialog rd-window">` ⊃ `<WindowBar tone="danger" title={title} titleId={titleId} onClose={onCancel} />` + `<div class="rd-window-body">`（説明 + `.qrcc-confirm-dialog__actions`）。`manage.css` の `.qrcc-confirm-dialog` から `padding` / `border-radius` / `background` / `color` を消し、`padding: 0; max-inline-size: min(32rem, 90vi); box-shadow: var(--rd-shadow-overlay)` だけ残す（本文の余白は `.rd-window-body` が持つ）。`::backdrop` はそのまま。× は「やめる」と同じ `onCancel` |

### 文字（typography）

| 項目                   | 決定                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| import                 | `index.css` に `@import '@rimltempest/riml-ds-css/typography.css';` と `@import '@rimltempest/riml-ds-css/atoms.css';` を `patterns.css` の**直後**に足す（どちらも自分で `@layer rd.components` に包まれている）                                                                           |
| 見出し                 | `base.css` の `h1..h4` を `font: var(--rd-type-heading-1)` … `var(--rd-type-heading-4)` に置き換える（`font-family` / `font-size` の個別指定を消す。`line-height` は `font` 短縮形が持つので `:where(h1..h4)` の `line-height: 1.3` も消す。`text-wrap: balance` と `margin-block` は残す） |
| 生値の掃除             | `tokens.css` から `--qrcc-text-base` / `-lg` / `-xl` / `-2xl` を消し、`tokens.test.ts` の `KEPT_LOCAL` を `['--qrcc-measure']` だけにする（`--qrcc-text-base` を他の CSS が使っていたら `1rem` を直接書くか `--rd-type-body-font-size` に替える。grep で確認）                              |
| `.rd-caption` 等の採用 | **この plan では見出しだけ**。`.rd-caption` / `.rd-alert` / `.rd-table` などの atoms の採用は見た目確認のあとで別 plan（`index.css` に import しておくのは、次の plan が CSS 層の順序に悩まないため）                                                                                       |

### riml-ds の取り込み

`RIML_DS_DIR=/Users/riml/orca/projects/riml-ds bash scripts/vendor-riml-ds.sh && bun install`（**`--frozen-lockfile` 無し** — tgz の中身が変わるので
`bun.lock` の整合性ハッシュを更新する。`bun.lock` の差分は tgz 2 行だけであること）。riml-ds 側で先に `bun run build` が済んでいること
（`system/css/dist/patterns.css` に `rd-window-bar` が在る）。済んでいなければ STOP（advisor が riml-ds 側でビルドする）。

## 手順（red → green。各 Step の終わりにコミット）

### Step 0 — 取り込み（`chore(ui): vendor riml-ds with window controls and typography`）

1. 上の「riml-ds の取り込み」を実行
2. `bun run test --filter @qrcc/ui`（または `bun test shared/ui`）を回す。**`mado.test.ts` などが落ちるのが正常**（帯の構造が変わったため）。落ちたテスト名を控える
3. `vendor/riml-ds/*.tgz` と `bun.lock` をコミット

### Step 1 — `<Window>` の帯（`feat(ui): window bar with close and collapse controls`）

red: `shared/ui/src/components/window.test.tsx` に足す（既存 4 件は帯の構造に合わせて直す — `data-tone` の検査対象を
`region.querySelector('header.rd-window-bar')` に）:

- 「帯は header で、見出しは帯の中」: `region.querySelector('header.rd-window-bar > h2.rd-window-title')` が在り、`data-tone` は header 側
- 「onClose を渡すと閉じるボタンが出て、押すと呼ばれる」: `getByRole('button', { name: '閉じる' })`、`dataset['action'] === 'close'`、click → called once
- 「collapsible なら たたむボタンが出て、押すと本文が hidden になり aria-expanded が false になる」: `aria-controls` が body の id を指す
- 「どちらも無ければ .rd-window-controls は無い」

green: 設計どおりに `window.tsx` を書き直す。`WindowBar` を export（`shared/ui/src/index.ts` にも追加）。`bun run check` 通過。

### Step 2 — ダイアログを窓に（`feat(manage): confirm dialog wears the window chrome`）

red: `features/manage/ui/codes-screen.test.tsx`（ダイアログを開く既存テストの隣）に「確認ダイアログの帯の × で取り消せる」:
削除 → dialog が開く → `within(dialog).getByRole('button', { name: '閉じる' })` を click → `onCancel` 相当（一覧が変わらない・dialog が閉じる）。
`dialog.classList.contains('rd-window')` と `dialog.querySelector('header.rd-window-bar[data-tone="danger"]')` も見る。

green: `confirm-dialog.tsx` と `manage.css` を設計どおりに。

### Step 3 — 取り消しの板と共有画面（`feat(manage): undo notice and shared code screen become windows`）

red:

- `codes-screen.test.tsx`: 削除後に `getByRole('region', { name: '削除しました' })` が在り、その中に「削除を取り消す」ボタンと「閉じる」ボタンが在る。
  「閉じる」を押すと region が消える（取り消しボタンも消える）。「フォルダ」 region の帯に「たたむ」ボタンが在る
- `features/manage/ui/shared/shared-code-screen.test.tsx`（無ければ `codes-screen.test.tsx` を手本に新設）: ready 状態で
  `getByRole('region', { name: '共有されたコード' })` と `getByRole('region', { name: 'このリンクでできること' })` が在る

green: 設計どおりに。`manage.css` の `.qrcc-manage-undo` を消す（grep で 0 件に）。

### Step 4 — 文字（`feat(ui): headings use riml-ds typography tokens`）

red: `shared/ui/src/styles/tokens.test.ts` の `KEPT_LOCAL` を `['--qrcc-measure']` に → 落ちる。
`shared/ui/src/styles/mado.test.ts` に「`index.css` が `typography.css` と `atoms.css` を import している」を足す → 落ちる。

green: `index.css` / `base.css` / `tokens.css` を設計どおりに。`grep -rn -- '--qrcc-text-\(base\|lg\|xl\|2xl\)' shared features services/web/src` が 0 件。

### Step 5 — 実ブラウザ（`test(e2e): window controls and dialog chrome`）

- `e2e/tests/mado.spec.ts` に 1 件: 一覧画面で「フォルダ」窓の「たたむ」を押すと本文が見えなくなり、もう一度押すと戻る（`aria-expanded` も見る）
- `e2e/tests/manage.spec.ts` の削除フローに 1 行: 確認ダイアログの「閉じる」（×）で取り消せる
- `bun run a11y` と `bun run test:e2e`（あれば）を回す。スクリーンショットを 3 枚撮る（一覧の窓 + 取り消しの窓、確認ダイアログ、共有画面）
  → `e2e/__screenshots__/plan-013/` ではなく **一時ディレクトリ**に置き、パスを報告に書く（リポジトリには入れない）

### Step 6 — 仕上げ

- `docs/adr/0012-mado-look.md` の「riml-ds を正として変えたもの」の表に 1 行: 「帯 ⊃ 見出し。`data-tone` は帯。丸はボタン（ADR-0014 追随、plan 013）」
- `bun run check` / `bun run test` / `bun run a11y` を通す

## 完了条件（機械で検査できるもの）

- `bun run check` exit 0、`bun run test` 全 pass、`bun run a11y` 全 pass
- `grep -rn 'rd-window-title' shared/ui/src/components/window.tsx` の見出し行に `data-tone` が無い。`grep -c 'rd-window-bar' shared/ui/src/components/window.tsx` ≥ 1
- `grep -rn 'qrcc-manage-undo' features shared` が 0 件
- `grep -rn -- '--qrcc-text-\(base\|lg\|xl\|2xl\)' shared features services/web/src` が 0 件
- `grep -c "typography.css\|atoms.css" shared/ui/src/styles/index.css` が 2
- `grep -n 'aria-labelledby' features/manage/ui/shared/shared-code-screen.tsx` が 0 件（`<Window>` が持つ）
- `git diff --name-only 6c84985...HEAD` が触ってよいパスに収まる（`bash scripts/guard.sh` があればそれで）
- `git diff --stat 6c84985...HEAD -- bun.lock` が tgz の行だけ

## STOP する条件

- riml-ds の `patterns.css` に `.rd-window-bar` が無い、または `typography.css` / `atoms.css` が無い（017 / 018 未マージ）
- `scripts/vendor-riml-ds.sh` が失敗する（peerDependency 404 など）→ スクリプトを直さず報告
- `font: var(--rd-type-heading-N)` に置き換えると `e2e/tests/mado.spec.ts`（rd の CSS が base より強いこと）が落ちる → 層の順序の問題。`index.css` の `@layer` 行を変えず報告
- `bun run a11y` でコントラストが落ちる（帯の色は riml-ds のトークン。qrcc 側で色を足して直さない）
- `<Window>` を使う 13 か所のどこかで見出しの段（headingLevel）を変えないと構造が壊れる

## スコープ外

- `.rd-caption` / `.rd-alert` / `.rd-table` / `.rd-list-row` / `.rd-toolbar` など atoms の採用（次の plan。import だけこの plan で済ませる）
- 「広げる（□）」ボタン。qrcc では使わない
- riml-ds の `rd-window` 部品（ティア B、Lit）の採用。qrcc は React なので CSS 版（`.rd-window`）を使い続ける（ADR-0012）
- riml-ds の reset / base の取り込み（段階 2。npm 公開後）
- `e2e/tests/auth.spec.ts:153` の flake

## 保守メモ

- 帯のマークアップの正は riml-ds `docs/brand.md` §7.1。riml-ds が `patterns.css` を変えたら `vendor-riml-ds.sh` → `bun install` → `window.test.tsx` が最初に落ちる
- `WindowBar` を使うのは `Window` と `ConfirmDialog` の 2 つ。3 つ目が出たら `@qrcc/ui` の中に留める（features 側で帯を組まない）
- `collapsible` の状態は Window の中。URL やストレージに保存しない（一覧を畳んだ状態を覚えたい要望が出たら別 plan）
- 見出しの大きさは riml-ds の `--rd-type-heading-N`。qrcc で「もう少し大きく」が出たら riml-ds のトークンで議論する（qrcc に生値を戻さない）
