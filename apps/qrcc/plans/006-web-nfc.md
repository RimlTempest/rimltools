# Plan 006: NFC タグに書き込めるようにする（QR・バーコード以外の運び方）

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 57f52ad..HEAD -- apps/web/src/routes.ts features/shell tsconfig.json`
> 出力が空でなければ「Current state」の引用と実際のコードを突き合わせ、
> 食い違えば STOP condition として扱うこと。

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED（対応ブラウザが限られ、物理的なタグに書き込む）
- **Depends on**: none（他のレーンと独立）
- **Category**: direction
- **Planned at**: commit `57f52ad`, 2026-09-06

## Why this matters

このアプリは「短い情報を人と機械の間で運ぶ」道具で、いまその手段は
QR とバーコードだけ。**NFC タグは同じ役割を、印刷せずに果たす。**
URL やテキストをタグに書けば、かざすだけで開く。

qrcc にとって都合がよいのは、**Web NFC がブラウザの中で完結する**こと。
サーバも D1 も使わないので、無料枠（ADR-0009）に一切影響しない。
生成・読み取りを端末内で完結させてきた方針（ADR-0003）とも揃う。

**ただし対応が狭い。** Web NFC は **Android の Chrome だけ**で、
iOS もデスクトップも動かない。だから「動かない環境で何も壊さない」ことが
この計画の主要な仕事になる。

## Current state

### この機能はまだ何も無い

`grep -rn "NDEFReader\|nfc" --include='*.ts' --include='*.tsx' features apps` は
0 件。新しい feature を 1 つ作る。

### 新しい feature の作り方（既存に倣う）

```json
// features/scan/package.json（手本）
{
  "name": "@qrcc/scan",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./contract": "./contract/index.ts",
    "./ui": "./ui/index.ts",
    "./ui/scan.css": "./ui/scan.css",
    "./ui/wiring": "./ui/scan-wiring.route.tsx"
  },
  "scripts": { "build": "tsc --build", "test": "bun test" },
  "dependencies": {
    "@qrcc/contract": "workspace:*",
    "@qrcc/ui": "workspace:*",
    "@qrcc/wasm": "workspace:*",
    "@tanstack/react-router": "1.170.32"
  }
}
```

```json
// features/generate/tsconfig.json（手本）
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["es2024", "dom", "dom.iterable"],
    "resolveJsonModule": true
  },
  "include": ["contract/**/*", "core/**/*", "ui/**/*", "server/**/*", "fixtures/**/*.json"],
  "references": [{ "path": "../../shared/contract" }, { "path": "../../shared/ui" }],
  "exclude": ["**/*.route.*", "dist"]
}
```

`bun` のワークスペースは `package.json` の `"workspaces": ["apps/*", "features/*", "shared/*", "e2e"]`
なので、`features/nfc/` を作れば自動的に含まれる。

### URL 構造とナビ（どちらも 1 行の追記）

```ts
// apps/web/src/routes.ts
export const routes = rootRoute('shell/ui/root.route.tsx', [
  // トップページが生成と読み取りを兼ねる（/generate と /scan は廃止）
  index('shell/ui/home.route.tsx'),
  route('/print', 'print/ui/print.route.tsx'),
  route('/codes', 'manage/ui/codes.route.tsx'),
  // …
])
```

```ts
// features/shell/ui/nav-items.ts
/**
 * グローバルナビの項目。
 * 新しい画面を足すレーンは、ここに 1 行追記する（append-only なので競合しにくい）。
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'コードを作る・読み取る' },
  { to: '/print', label: '印刷とラベル' },
  { to: '/codes', label: '保存したコード' },
  { to: '/sign-in', label: 'サインイン' },
  { to: '/settings', label: '設定' },
]
```

```css
/* apps/web/src/styles/app.css — @import を 1 行追記する（append-only） */
@import '@qrcc/scan/ui/scan.css' layer(components);
```

ルートの `tsconfig.json` の `references` にも 1 行足す。

### 能力検出の書き方（手本がある）

ブラウザ機能の有無は**ハイドレーション後にしか分からない**。SSR の出力と
食い違わせないため、既存はこの形にしている。

```tsx
// features/scan/ui/scan-wiring.route.tsx
const neverChanges = () => () => {}

export const ScanSection = ({ headingLevel = 1 }) => {
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const inBrowser = isHydrated && canUseBrowserWasm()

  return (
    <ScanScreen
      startCamera={inBrowser && canUseCamera() ? startCamera : undefined}
      // …
    />
  )
}
```

```ts
// features/scan/ui/browser-scan.ts
/** この環境でカメラを使えるか。SSR とハイドレーション前は使えない。 */
export const canUseCamera = (): boolean =>
  typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined
```

**この形をそのまま真似ること。**

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（`as const` は許可）。
  `NDEFReader` は TypeScript の標準型に無い可能性が高い。**`any` で逃げない。**
  必要な部分だけの構造型を自分で書き、`in` と `typeof` で絞り込む
  （`shared/webmcp` の `ModelContext` と同じ方針。plans/001 参照）
- **ドメイン層（`features/*/contract` / `features/*/core`）で `throw` しない。**
  失敗は `Result<T, E>`。`ok()` / `err()` は `@qrcc/contract`。
  使用例は `features/scan/ui/browser-scan.ts:38-47`
- **依存（DOM・ハードウェア）は関数引数で受け取る。** 配線は
  `*.route.tsx`（composition root）だけ。**`NDEFReader` を画面から直接触らない**
- **feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する**（ADR-0007）
- **実装より先に失敗するテストを書く**（red → green）
- **アクセシビリティは WCAG AAA を狙っている。** markuplint と axe（e2e）が
  CI で走る。ボタンは 44×44 CSS px 以上（`--qrcc-target-min`）、
  状態は色だけで伝えない
- コメントは日本語、識別子は英語

## Web NFC について（実行者は知らない前提で書く）

- API は `NDEFReader`。書き込みは `await new NDEFReader().write({ records: [...] })`
- **`https:` と利用者の操作（クリック）が必須**。ボタンのクリック内から呼ぶこと
- 権限プロンプトが出る。拒否されたら例外になるので必ず捕まえる
- **対応は Android の Chrome のみ。** iOS・デスクトップには `NDEFReader` が無い
- レコード型は `'url'` と `'text'` を使う。
  **Wi-Fi の書き込み（WPS / `application/vnd.wfa.wsc`）はこの計画に含めない** —
  仕様が別物で、端末ごとの相性も悪い

### 物理的に元に戻せない操作であること

タグへの書き込みは**物理的な操作**で、上書きすると前の内容は戻らない。
タグによっては「ロック」すると二度と書き換えられなくなる。

- **書き込む前に、何を書くかを確認させること**
- **v1 ではロック機能を作らない。** `makeReadOnly` は使わない

## Commands you will need

| 目的             | コマンド                | 成功時  |
| ---------------- | ----------------------- | ------- |
| 依存インストール | `bun install`           | exit 0  |
| 型検査           | `bun run typecheck`     | exit 0  |
| テスト（絞る）   | `bun test features/nfc` | 全 pass |
| テスト（全体）   | `bun run test`          | 全 pass |
| 一式             | `bun run check`         | exit 0  |
| e2e              | `bun run e2e`           | 全 pass |

## Scope

**In scope**:

- `features/nfc/**`（新規。package.json / tsconfig.json / contract / core / ui）
- `apps/web/src/routes.ts`（1 行追記）
- `features/shell/ui/nav-items.ts`（1 行追記）
- `features/shell/ui/global-nav.test.tsx`（項目数のテストがあれば追随）
- `apps/web/src/styles/app.css`（1 行追記）
- `tsconfig.json`（references に 1 行追記）
- `e2e/tests/nfc.spec.ts`（新規）
- `docs/architecture.md`（URL 構造の表に 1 行）

**Out of scope**（触らない）:

- `features/generate/**` — plans/003 と 004 が所有している。
  内容の種類を共有したくなっても、**この計画では自前で持つ**（URL とテキストだけ）
- `features/scan/**` — plans/005 が所有している。
  **NFC の読み取りはこの計画に含めない**（書き込みだけ）
- `features/shell/ui/home.route.tsx` — plans/001（WebMCP）が触る予定。
  NFC は独立したページにするので、ここは触らない
- **Wi-Fi の NFC 書き込み（WPS）** — 仕様が別物。含めない
- **タグのロック（`makeReadOnly`）** — 元に戻せない。v1 では作らない

## Git workflow

- ブランチ: `feat/web-nfc`
- Conventional Commits。例: `feat(nfc): NFC タグに URL を書き込めるようにする`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: feature の骨格を作る

`features/nfc/package.json` と `tsconfig.json` を、上の手本と同じ形で作る。
依存は `@qrcc/contract` と `@qrcc/ui` と `@tanstack/react-router`。

ルートの `tsconfig.json` の `references` に `{ "path": "./features/nfc" }` を足す。

**Verify**: `bun install` → exit 0。`bun run typecheck` → exit 0。

### Step 2: 書き込みの契約と純粋ロジック（red → green）

`features/nfc/contract/record.ts`:

```ts
/** タグに書くもの。いまは URL と テキストだけ。 */
export type NfcRecord =
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | { readonly kind: 'text'; readonly text: NonEmptyText }

export type NfcWriteError =
  | { readonly kind: 'unsupported' } // この環境に NDEFReader が無い
  | { readonly kind: 'permission_denied' }
  | { readonly kind: 'no_tag' } // かざされなかった / 離れた
  | { readonly kind: 'write_failed'; readonly detail: string }
```

`features/nfc/core/`:

- `toNdefRecords(record: NfcRecord)` — `NDEFReader.write` に渡す形に変える純粋関数
- `describeNfcError(error: NfcWriteError): string` — 日本語の案内。
  **必ず「次に何をすればよいか」まで書く**（例:「タグが見つかりませんでした。
  端末の背面にタグを近づけたまま、もう一度お試しください。」）

**Verify**: `bun test features/nfc` → 全 pass（先に red を確認すること）。

### Step 3: ブラウザ実装を 1 ファイルに閉じる

`features/nfc/ui/browser-nfc.ts` に、**この feature で唯一ハードウェアに
触る場所**を作る。`features/scan/ui/browser-scan.ts` が手本。

```ts
/** この環境で NFC に書けるか。SSR とハイドレーション前は書けない。 */
export const canWriteNfc = (): boolean => /* typeof window と 'NDEFReader' in window */

/** 書き込み。例外を投げず Result で返す。 */
export type WriteNfc = (record: NfcRecord) => Promise<Result<void, NfcWriteError>>
export const browserNfcWriter = (): WriteNfc => /* … */
```

**`any` を使わないこと。** `NDEFReader` の型が無いので、必要な部分だけの
構造型を自分で定義し、`'NDEFReader' in window` で絞り込む。

**Verify**: `bun run check` → exit 0（`qrcc/no-type-assertion` に引っかからないこと）。

### Step 4: 画面

`features/nfc/ui/nfc-screen.tsx`。画面は `WriteNfc` を**引数で受け取る**ので、
テストでは偽物を渡せる（`ScanScreen` と同じ設計）。

守ること:

- **非対応の環境で、まず「使えない理由」を伝える。** Android の Chrome が
  必要であること、iOS では使えないことを、ボタンを出す前に書く。
  ここを黙って空にすると、利用者は自分の操作を疑う
- **書く前に確認させる。** 何を書くかを表示し、確認のうえで書き込む。
  元に戻せない操作であることを伝える
- 進行状況は読み上げ領域（`LiveRegion`）に出す。
  「タグを近づけてください」→「書き込みました」
- 状態を色だけで伝えない

`features/nfc/ui/nfc.route.tsx` が composition root。
`browserNfcWriter()` を組み立てて画面に渡す。能力検出は
`useSyncExternalStore` で**ハイドレーション後まで遅らせる**（Current state の手本どおり）。

**Verify**: `bun test features/nfc` → 全 pass。`bun run check` → exit 0。

### Step 5: 配線（3 箇所の 1 行追記）

- `apps/web/src/routes.ts` に `route('/nfc', 'nfc/ui/nfc.route.tsx')`
- `features/shell/ui/nav-items.ts` に `{ to: '/nfc', label: 'NFC タグに書く' }`
- `apps/web/src/styles/app.css` に `@import '@qrcc/nfc/ui/nfc.css' layer(components);`

`features/shell/ui/global-nav.test.tsx` に項目数を数えるテストがあるので、
落ちたら追随させること。

**Verify**: `bun run typecheck` → exit 0。`bun run test` → 全 pass。

### Step 6: 非対応環境で壊れないことを e2e で固定する

**これがこの計画で最も重要なテスト。** CI のブラウザは デスクトップ Chromium で、
`NDEFReader` を持たない。つまり **CI で常に「非対応の経路」が走る**。

`e2e/tests/nfc.spec.ts`:

1. `/nfc` を開いて、**使えない理由が画面に出ている**こと
2. **コンソールにエラーが出ていない**こと（能力検出が例外を投げていない）
3. axe の違反が無いこと（`@a11y` タグを付ける。既存 spec の `WCAG_TAGS` に倣う）
4. `page.addInitScript` で偽の `NDEFReader` を差し込み、
   **対応環境の経路**（確認 → 書き込み → 完了の読み上げ）が動くこと

固定待ち（`waitForTimeout`）を使わず、`await expect(...)` の自動待ちだけを使うこと。

**Verify**: `bun run e2e` → 全 pass。

### Step 7: ドキュメント

`docs/architecture.md` の URL 構造の表に `/nfc` を 1 行足す。
**対応が Android の Chrome だけであることを書き添えること。**

**Verify**: `bun run check` → exit 0。

## Test plan

| ファイル                              | 内容                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/nfc/core/*.test.ts`         | `toNdefRecords` が URL / テキストで正しい形を作ること。`describeNfcError` が全エラーに**次の行動まで**書いた文言を返すこと（`NfcWriteError` を網羅）         |
| `features/nfc/ui/browser-nfc.test.ts` | 偽の `NDEFReader` で: 成功、権限拒否、タグ無し、書き込み失敗。**すべて例外を投げず `Result` で返る**こと。`NDEFReader` が無い環境で `unsupported` を返すこと |
| `features/nfc/ui/nfc-screen.test.tsx` | 非対応のとき理由が出ること。確認せずに書き込まないこと。進行が読み上げ領域に出ること                                                                         |
| `e2e/tests/nfc.spec.ts`               | Step 6 の 4 本                                                                                                                                               |

**「非対応」の経路を必ずテストすること。** 利用者の大半（iOS・デスクトップ）が
通るのはそちらで、CI で実際に走るのもそちら。

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] `grep -rn "NDEFReader" features/nfc/ | grep -v browser-nfc | grep -v test`
      が **0 件**（ハードウェアに触る場所が 1 ファイルに閉じている）
- [ ] `grep -rnE ": any|\bas [A-Z]" features/nfc/` が **0 件**
- [ ] `grep -rn "makeReadOnly" features/nfc/` が **0 件**（ロックを作っていない）
- [ ] `git diff --name-only` に `features/generate/` と `features/scan/` が
      **含まれない**（他レーンと衝突していない証拠）
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 006 の行が DONE

## STOP conditions

止めて報告すること:

- `NDEFReader` の型を `any` や型アサーションなしで書けない。
  **`any` を入れて進めない。**
- Wi-Fi の NFC 書き込みを実装したくなった。範囲外。
- タグのロック（`makeReadOnly`）を足したくなった。**元に戻せない操作**なので
  v1 では作らない。
- `features/shell/ui/home.route.tsx` を編集したくなった。plans/001 が触る。
- 実機の Android が無いと先に進めないと判断した。**偽の `NDEFReader` で
  経路を固定するところまでが範囲**なので、実機確認は完了条件に含めない。
  ただし「実機未確認である」ことは報告に必ず書くこと。

## Maintenance notes

- **実機（Android + Chrome）での確認は、この計画では行えない。** CI にも
  開発機にも NFC が無い。偽の `NDEFReader` で経路は固定してあるが、
  **本物のタグに書けたことは誰も確認していない**状態でマージされる。
  最初の実機確認は人がやること
- 対応ブラウザが増えたら、非対応の案内文を見直すこと。いまは
  「Android の Chrome が必要」と断言しているが、これは 2026-09 時点の話
- **NFC の読み取り**（`NDEFReader.scan()`）は自然な次の一手。ただし
  読み取り結果の解釈は plans/005 が作る仕組みと重なるので、
  **005 が入ってから**、その解釈を再利用する形で足すのが筋
- 内容の種類（名刺・地図など）を NFC でも書けるようにするなら、
  plans/003 が `features/generate/contract` に作る型を共有する形になる。
  **両方が落ち着いてから**寄せること。いま共有すると衝突する
