# 012: 窓（Mado）の見た目を qrcc に入れる — 画面（features/*/ui）

**優先度**: P1　**規模**: M　**依存**: 011（`<Window>` と `patterns.css` が main に入っていること）　**レーン**: `feat/mado-screens`
**計画時の main**: `fc1896b`（011 が入った後の main で始める。Drift check で 011 の成果を確かめる）

> **Drift check（最初に実行）**:
> `grep -n "export { Window }" shared/ui/src/index.ts && grep -c 'riml-ds-css/patterns.css' shared/ui/src/styles/index.css`
> どちらも 1 以上でなければ 011 が未了。**STOP**。
> `git diff --stat fc1896b..HEAD -- features/*/ui e2e/tests` を読み、下の表の `file:line` がずれていたら同名の要素を探して読み替える。

## なぜ

plan 011 で `@qrcc/ui` に **窓（Mado）** の基盤が入った: riml-ds の `.rd-window`（灰茶色のタイトル帯 + 硬い影）を包む `<Window>`、
ピルのボタン、井戸の入力欄、点線の `hr`、丸ゴシックの見出し。ボタン・入力欄・見出しは既存の画面にそのまま流れるが、
**「板」（`background: surface-raised; border; border-radius` で囲った section）は画面ごとに手書き**なので、これを `<Window>` に
置き換えないと画面は窓にならない。riml-ds `docs/brand.md` §7.1 の言葉で言えば、**題のある区画はすべて窓**、題の無い箱は作らない。

見た目のルール（riml-ds `docs/brand.md`）:

- 窓のタイトル帯 = その区画の見出し。見出しの段（h2/h3）は**今の段をそのまま保つ**（AAA 2.4.10: 段を飛ばさない）
- 窓の中に板を入れ子にしない。窓の中の区切りは `<hr>`（点線）か余白
- 危険な操作（削除・上書き）の窓だけ `tone="danger"`、注意書きは `tone="warning"`、それ以外はトーン無し
- 一覧の 1 行（`li`）は窓にしない。窓は「画面の区画」の単位

## リポジトリの決まり（守る）

- `any` / `as` / `!` / `class` / `enum` を書かない（`.oxlintrc.json` の `qrcc/*`）
- 失敗するテストを先に書く（red → green）。`.claude/skills/qrcc-tdd/SKILL.md`。UI のテストは `@testing-library/react` で
  **role と名前**で取る（`features/scan/ui/scan-screen.test.tsx` などを読む）。`className` を検査しない
- feature 同士は `@qrcc/<name>` 経由でだけ依存する。`<Window>` は `@qrcc/ui` から import（`import { Window } from '@qrcc/ui'`）
- CSS: 新しく書く宣言は `var(--rd-*)`。`--qrcc-*` を足さない。hover は `@media (hover: hover)`
- 触ってよいパス（`scripts/lanes.tsv` の `feat/mado-screens`）: `features/*/ui/**`（`*.tsx`, `*.css`, `*.test.tsx`）, `e2e/tests/**`
- 触らない: `features/*/{contract,core,engine,worker}/**`, `shared/**`, `apps/**`, `vendor/**`, `docs/**`, `plans/README.md`, `.claude/**`
- riml-ds / noter のリポジトリに触らない。デプロイ・公開・`gh`・push をしない
- コミットは Conventional Commits。feature ごとに 1 コミット。コミット前に `bun run check`

## `<Window>` の API（`shared/ui/src/components/window.tsx`、011 で作った）

```tsx
<Window title={ReactNode} headingLevel={2 | 3 | 4 = 2} tone={'accent' | 'warning' | 'danger'} id={string}>
  {children}
</Window>
// → <section class="rd-window" aria-labelledby=… data-tone=…><h2 class="rd-window-title">…</h2><div class="rd-window-body">…</div></section>
```

窓の中身にレイアウト（grid / gap）が要るなら、**children を自分の div で包む**（`<Window title="…"><div className="qrcc-scan__panel">…</div></Window>`）。
`Window` に className は渡せない（渡せるようにしない。`.rd-window*` を上書きしないための決まり）。

## 置き換える板（すべて）

`section + 見出し` の組を `<Window>` にする。見出しの `id` と section の `aria-labelledby` は Window が内部で付けるので**消す**
（`useId()` の変数が未使用になったら変数も消す）。見出しの段は現状のまま `headingLevel` に渡す。

| #   | ファイル:行（計画時）                           | 今                                                                        | 置き換え                                                                                                            |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `features/scan/ui/scan-screen.tsx:369`          | `section.qrcc-scan__panel` + `<Section>カメラで読み取る</Section>`        | `<Window title="カメラで読み取る" headingLevel={headingLevel === 2 ? 3 : 2}>`、中身を `div.qrcc-scan__panel` で包む |
| 2   | `features/scan/ui/scan-screen.tsx:407`          | 同上「画像から読み取る」                                                  | 同上                                                                                                                |
| 3   | `features/scan/ui/scan-screen.tsx:419`          | 同上「読み取った内容」                                                    | 同上。`Section` 変数が未使用になったら消す（`Title` は残る）                                                        |
| 4   | `features/manage/ui/codes-screen.tsx:328`       | `section[aria-labelledby=qrcc-manage-new]` + h2「新しいコードを保存する」 | `<Window title="新しいコードを保存する">`                                                                           |
| 5   | `features/manage/ui/codes-screen.tsx:430`       | h2「フォルダ」                                                            | `<Window title="フォルダ">`                                                                                         |
| 6   | `features/manage/ui/codes-screen.tsx:486`       | h2「保存したコードの一覧」                                                | `<Window title="保存したコードの一覧">`                                                                             |
| 7   | `features/manage/ui/code-editor-screen.tsx:176` | h2「内容と見た目」                                                        | `<Window title="内容と見た目">`                                                                                     |
| 8   | `features/manage/ui/code-editor-screen.tsx:339` | h2「プレビュー」                                                          | `<Window title="プレビュー">`                                                                                       |
| 9   | `features/manage/ui/share-panel.tsx:68`         | h2「共有リンク」                                                          | `<Window title="共有リンク">`（`headingId` の `useId` を消す）                                                      |
| 10  | `features/print/ui/print-screen.tsx:330`        | `section.qrcc-no-print` + h2「印刷するものの一覧」                        | `<Window title="印刷するものの一覧">` を `div.qrcc-no-print` で**外から**包む（印刷時に消すのは外側）               |
| 11  | `features/auth/ui/sign-in-screen.tsx:114`       | `section.qrcc-auth-guide` + h2「ゲストで使うときの注意」                  | `<Window title="ゲストで使うときの注意" tone="warning">`、`ul` を `div.qrcc-auth-guide` で包む                      |
| 12  | `features/nfc/ui/nfc-screen.tsx:110`            | `section.qrcc-nfc__confirm` + h2「書き込む内容を確認してください」        | `<Window title="書き込む内容を確認してください" tone="warning">`、中身を `div.qrcc-nfc__confirm` で包む             |
| 13  | `features/generate/ui/code-preview.tsx:32`      | `figure.qrcc-code-preview`（題なし）                                      | `<Window title="できあがり" headingLevel={headingLevel}>` で figure を包む。figure の板の装飾は消す（下）           |

置き換え**ない**もの:

- `features/nfc/ui/nfc-screen.tsx:137` `section.qrcc-nfc__done` — 題が無い（`<p>` だけ）。窓にしない。そのまま
- `features/shell/ui/home-screen.tsx:44/47` `.qrcc-home__section` — 中に GenerateScreen / ScanScreen が丸ごと入る器。窓の入れ子になるので**そのまま**
- `features/print/ui/print-preview.tsx` — 紙面のプレビュー。印刷物に窓の装飾を出さない。そのまま
- `features/manage/ui/confirm-dialog.tsx` の `<dialog>` — 段階 3（riml-ds の `rd-dialog`）で置き換える。この計画では CSS だけ窓に寄せる（下）
- `fieldset` — フォームの群。窓にしない

## Step 0 — テストを先に書く（red）

各 feature の既存テスト（`features/<name>/ui/*.test.tsx`）に、置き換える板ごとに **region の存在**を 1 件足す。例（scan）:

```tsx
test('区画は題を名前に持つ region として見える', () => {
  render(<ScanScreen startCamera={undefined} decodeImageFile={fakeDecode} copyText={fakeCopy} />)
  expect(screen.getByRole('region', { name: 'カメラで読み取る' })).toBeDefined()
  expect(screen.getByRole('region', { name: '画像から読み取る' })).toBeDefined()
  expect(screen.getByRole('region', { name: '読み取った内容' })).toBeDefined()
})
```

**注意**: 現状も `section[aria-labelledby]` は region なので、このテストは**今でも通る**（red にならない）。red にするには
「見出しの `className` が `rd-window-title`」を見たくなるが、className を検査しない決まりなので、代わりに
**`getByRole('region', …).firstElementChild` が heading role を持つ**（Window は見出しを最初の子に置く）ことと、
generate の 13 番（今は figure で region が無い）で `getByRole('region', { name: 'できあがり' })` を書く。この 2 種類が red になる。

既存テストで `container.querySelector('section')` や `.qrcc-scan__panel` を直接見ているものがあれば、role ベースに書き直す
（見つけたらファイル名を報告メモに残す）。

`bun test features/` → 新しいテストだけ red。コミット: `test(ui): expect mado windows on screen sections`

## Step 1 — feature ごとに置き換える（順番: scan → manage → print → auth → nfc → generate）

各 feature で:

1. 表のとおり `<Window>` に置き換える。`import { Window } from '@qrcc/ui'`（既存の `@qrcc/ui` import に足す）
2. **CSS から板の装飾を消す**: 置き換えたクラスの `background`, `border`, `border-radius`, `padding`, `box-shadow` を消し、
   レイアウト（`display: grid`, `gap`, `grid-template-columns`, `justify-items`, `max-inline-size`, `container-type`）だけ残す。
   `.qrcc-auth-guide h2 { margin-block-start: 0; font-size }` のような**見出しの上書きは消す**（帯の見出しは riml-ds が決める）。
   forced-colors の `border-color: CanvasText` も板が消えるなら消す（`.rd-window` 側で riml-ds が復元する）
3. 窓と窓の間隔: 隣り合う窓に `margin-block-end: var(--rd-space-6)`（`.qrcc-scan__panel` にあった余白）を保つ。
   板のクラスが div に移って余白が中に入ってしまう場合は、親（画面のルート要素）に `display: grid; gap: var(--rd-space-6)` を付ける方を選ぶ
4. `bun test features/<name>` green → `bun run check` → コミット `feat(<name>): show sections as mado windows`

### generate（13 番）の補足

`code-preview.tsx` は `headingLevel: 3 | 4` を受け取り figcaption を出す。Window の `title="できあがり"` に `headingLevel` を渡し、
figure は Window の中に残す（`figcaption` は生成物の説明として引き続き意味がある）。`.qrcc-code-preview` の
`background / border / border-radius / padding` を消し、`display: grid; gap; container-type` を残す。`@container` の 2 段組はそのまま動く
（container は figure 自身）。

### shell（CSS だけ）

`features/shell/ui/shell.css`:

- `.qrcc-header__brand`: `font-family: var(--rd-font-family-display); font-size: var(--rd-type-heading-2-font-size)` は**大きすぎる**ので
  `1.375rem` 相当の `var(--rd-type-heading-2-font-size)` ではなく現状の `1.25rem` を保ち、書体だけ display にする
- `.qrcc-global-nav a`: `border-radius: var(--rd-radius-full)`、`font-weight: var(--rd-font-weight-bold)`。
  `[aria-current='page']` は `background: var(--qrcc-surface-sunken)` + 既存の `box-shadow: inset 0 -3px 0 var(--qrcc-accent)`
  （下線は残す — 色だけで現在地を示さない）
- `.qrcc-header` / `.qrcc-footer` の `border-block-end/start: 1px solid` → `0.125rem dotted var(--rd-color-border-default)`（点線の区切り）
- `.qrcc-breadcrumbs a`: 角丸をピルに

### manage の `confirm-dialog`（CSS だけ）

`features/manage/ui/manage.css` の `dialog` の規則（あれば）: `border: 0; border-radius: var(--rd-radius-lg); box-shadow: var(--rd-shadow-overlay);
padding: 0`、中の見出しを帯にはしない（段階 3 で `rd-dialog` に置き換えるまでの暫定）。`::backdrop` は `var(--rd-color-overlay-default)`。
規則が無ければ足さない。

## Step 2 — e2e と a11y

- `bun run a11y` → axe 違反 0（特に `region` ルール: `.rd-window` は `section[aria-labelledby]` なので landmark 扱いにならない。
  `main` の中にあれば問題ない）
- `bun run e2e` → 既存 spec が通る。`getByRole('heading', { name })` で取っている spec は変わらない。
  `locator('section')` の数を数えている spec があれば role ベースに直す（ファイル名を報告メモに）
- 320px 幅で横スクロールが出ないこと（既存の a11y spec が見ている。窓の影 0.25rem が右端で溢れたら、画面ルートに
  `padding-inline-end: var(--rd-space-1)` ではなく **`.rd-window` の親に `overflow: visible` のまま `margin-inline-end`** を足さず、
  riml-ds 側の問題として報告して STOP）

## Done criteria

- `grep -rn "aria-labelledby=\"qrcc-\(manage\|editor\|print\)-" features/*/ui/*.tsx` → 0 件（Window が付けるので手書きの id は消えている）
- `grep -rn "className=\"qrcc-scan__panel\"" features/scan/ui/scan-screen.tsx` → 3 件（div に移っている）、`<section` は 0 件
- `grep -rn "<Window" features/*/ui/*.tsx | wc -l` → 13
- `grep -rn "surface-raised" features/*/ui/*.css` → 板の背景としての使用が消えている（残っていてよいのは `.qrcc-global-nav a:hover` と
  `print.css` の紙面。それ以外が残っていたら理由を報告メモに）
- `bun run check` / `bun run test` / `bun run a11y` / `bun run e2e` → exit 0
- `git diff --name-only <開始時の main>..HEAD | grep -v '^features/[a-z]*/ui/\|^e2e/tests/'` → 空

## STOP conditions

- 011 が main に無い
- `<Window>` の中で `fieldset` / `form` のレイアウトが崩れて、`shared/ui` の CSS を直さないと通せない（該当ファイルと崩れ方を報告）
- axe が `heading-order` や `region` で新しい違反を出す（Window の段の渡し方が間違っている可能性。どの画面か報告）
- e2e の spec を 3 本以上書き直さないと通らない（画面の構造を変えすぎている兆候）

## 保守メモ

- 新しい画面の区画は最初から `<Window>` で書く。`section + h2` を手書きしない（この計画の表を増やさない）
- 板の装飾（背景・枠・角丸・影）を feature の CSS に書かない。書きたくなったら riml-ds の `patterns.css` に足す議題
- 段階 3 で `confirm-dialog` は riml-ds の `rd-dialog`（React ラッパー）に、`Field` は `rd-text-field` に置き換える予定
