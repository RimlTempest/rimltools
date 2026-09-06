# Plan 001: トップページの生成と読み取りを WebMCP のツールとしてエージェントに公開する

> **Executor instructions**: この計画を上から順に実行すること。各ステップの
> 検証コマンドを必ず実行し、期待結果を確認してから次に進むこと。
> 「STOP conditions」に該当したら、勝手に判断せず**止めて報告**すること。
> 完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 87d8897..HEAD -- features/generate features/scan features/shell shared package.json tsconfig.json`
> 出力が空でなければ、下の「Current state」の引用と実際のコードを突き合わせること。
> 食い違っていたら STOP condition として扱うこと。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `ac0d989`, 2026-09-03
- **Reconciled at**: commit `87d8897`, 2026-09-06（下記「2026-09-06 の見直し」を参照）

## Why this matters

qrcc の中心機能である**生成と読み取りは、すでに端末内の wasm だけで完結している**
（ADR-0003）。WebMCP はこの client-side のロジックを、そのままブラウザ内の AI
エージェントに「ツール」として差し出すための W3C の API で、**サーバを 1 行も
書かずに**エージェント対応ができる。qrcc の場合、追加の Worker リクエストも
D1 書き込みも発生しないので、無料枠の制約（ADR-0009）とも衝突しない。

これが入ると、エージェントが DOM を推測してクリックを模倣する代わりに、
`generate-code` / `decode-code-image` を関数として直接呼べるようになる。

**重要な前提**: WebMCP は 2026-09 時点で **Origin Trial 段階**であり、既定では
どのブラウザでも有効になっていない（Chrome 149 / Edge 150 が OT、Firefox と
Safari は標準化ポジションの表明のみ）。**この計画では Origin Trial トークンを
登録しない**とオーナーが決めている。したがって実装は「API があれば登録し、
無ければ何もしない」形にし、**API が無い環境で挙動が一切変わらないこと**を
テストで固定する。仕様が正式化すれば自動的に効き始める。

## 2026-09-06 の見直し（この計画を書いたあとに入った変更）

この計画は `ac0d989` の時点で書かれた。そのあと plans/002〜007 が入り、
**前提が 3 つ変わっている**。着手前に必ず読むこと。

### 1. 内容の種類が 3 → 9、符号が 3 → 8 に増えた

|                   | 当時                 | いま                                      |
| ----------------- | -------------------- | ----------------------------------------- |
| `PAYLOAD_KINDS`   | text / url / wifi    | + tel / email / sms / geo / event / vcard |
| `SYMBOLOGY_KINDS` | qr / code128 / ean13 | + code39 / code93 / ean8 / itf / codabar  |

**生成ツールの `inputSchema` に種類を直書きしないこと。** `PAYLOAD_KINDS` と
`SYMBOLOGY_KINDS` から組み立てれば、今後増えても追随する。
`SYMBOLOGY_META[kind].label` と `PAYLOAD_META[kind].description` が
そのままツールの説明文に使える。

`isPayloadCompatible(payloadKind, symbologyKind)` で相性が引ける（plans/002）。
エージェントが載らない組み合わせを指定したとき、ここで弾いて理由を返すこと。

### 2. 読み取り結果を解釈する仕組みができた（plans/005）

`features/scan/core/interpret/` に `interpret(text): Interpretation` がある。
GS1 の識別子・名刺・Wi-Fi・メール・電話・SMS・地図・予定を構造化して返し、
どれにも当てはまらなければ `{ kind: 'plain' }` に落ちる。

**読み取りツールはこれを使うこと。** 生の文字列だけを返すのは、
エージェントに再度パースさせることになって筋が悪い。`content` には
**生テキストと解釈結果の両方**を入れる（解釈が外れたときに元が失われないため）。

ただし `features/scan/package.json` の `exports` に `"./core"` がまだ無い。
**この計画で足すこと**（`features/scan/package.json` は既に in scope）。

### 3. トップページの配線は変わっていない

`features/shell/ui/home.route.tsx` は当時の引用と**完全に一致**する
（確認済み）。下の「いま qrcc 側にあるもの」の引用はそのまま使える。

### 変わっていないこと

- WebMCP は 2026-09 時点でも Origin Trial（Chrome 149 / Edge 150）。
  **トークンは登録しない**という判断は変わらない
- `shared/wasm` の `makeWasmRenderer` / `makeWasmDecoder` の形
- `features/scan/contract/decode.ts` の `Detection` / `DecodeResponse`
  （plans/005 は意図的に触っていない）
- `features/scan/ui/browser-scan.ts` の `browserImageDecoder`

## Current state

### WebMCP の API（実行者は知らない前提で、ここに全部書く）

出典: <https://github.com/webmachinelearning/webmcp> の README（2026-09-03 時点）。

登録はこの形。**`navigator` ではなく `document` の下**にある。

```js
const controller = new AbortController()

await document.modelContext.registerTool(
  {
    name: 'add-todo',
    description: "Add a new item to the user's active todo list",
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text content of the todo item' },
      },
      required: ['text'],
    },
    async execute({ text }) {
      await addTodoItemToCollection(text)
      return {
        content: [{ type: 'text', text: `Added todo item: "${text}" successfully.` }],
      }
    },
  },
  { signal: controller.signal },
)

// 解除は signal を abort する
// controller.abort()
```

押さえるべき点:

- `registerTool` は **Promise を返す**。Permissions Policy で無効な場合は
  `NotAllowedError` の `DOMException` で **reject する**（`allow="tools"` /
  `Permissions-Policy: tools=()`）。呼び出し側で必ず捕まえること。
- `execute` の戻り値は `{ content: [{ type: 'text', text: string }] }`。
- 解除は `AbortController` の signal。専用の unregister 関数は無い。
- 既定では、登録したツールは**同一オリジンの文書とブラウザ組み込みエージェント
  にのみ**公開される。`exposedTo` を渡すと別オリジンにも公開されるが、
  **この計画では絶対に `exposedTo` を使わない**。
- TypeScript 型は npm の `webmcp-types`（2026-09-03 時点で 0.1.6）。
  **0.x で動きが速いので、使うなら完全固定のバージョンで入れること。**
  ただし後述のとおり、この計画では**自前の最小構造型**を使い、依存を増やさない。

### いま qrcc 側にあるもの

- `features/shell/ui/home.route.tsx` — トップページの composition root。
  生成と読み取りの配線をここで組み立てている。**ツールの登録もここで行う。**

  ```tsx
  // features/shell/ui/home.route.tsx:1-21（現状全文）
  import { createFileRoute } from '@tanstack/react-router'
  import { GenerateSection } from '@qrcc/generate/ui/wiring'
  import { ScanSection } from '@qrcc/scan/ui/wiring'
  import { HomeScreen } from './home-screen.tsx'
  import { routerLink } from './router-link.tsx'

  const Home = () => (
    <HomeScreen
      renderLink={({ to, label }) => routerLink({ to, label, isCurrent: false })}
      generate={<GenerateSection headingLevel={2} />}
      scan={<ScanSection headingLevel={2} />}
    />
  )

  export const Route = createFileRoute('/')({ component: Home })
  ```

- `shared/wasm/src/index.ts` — ブラウザ内エンジンの入口。
  `makeWasmRenderer(loadBrowserWasm)` と `makeWasmDecoder(loadBrowserDecoder)` を
  公開している。**どちらも遅延読み込み**で、最初に呼ばれるまで wasm を取りに行かない。

  ```ts
  // shared/wasm/src/index.ts:36-52
  export type WasmRenderer = {
    readonly render: <T, E>(
      request: unknown,
      decodeValue: Decoder<T>,
      decodeError: Decoder<E>,
    ) => Promise<Envelope<T, E>>
  }

  export type WasmDecoder = {
    readonly decode: <T, E>(
      image: Uint8Array,
      hints: unknown,
      decodeValue: Decoder<T>,
      decodeError: Decoder<E>,
    ) => Promise<Envelope<T, E>>
  }
  ```

- `features/generate/contract/index.ts` — 生成の型と検証。
  `RenderRequest` の形は次のとおり。

  ```ts
  // features/generate/contract/render.ts
  export type RenderRequest = {
    readonly payload: CodePayload
    readonly symbology: Symbology
    readonly style: RenderStyle
    readonly output: OutputFormat
  }

  export type RenderResponse = {
    readonly body: string
    readonly content_type: string
    readonly width: number
    readonly height: number
    /** 画像だけで提供しないための、人が読める内容（WCAG 1.1.1）。 */
    readonly description: string
    readonly warnings: readonly RenderWarning[]
  }
  ```

  公開されている値: `SYMBOLOGY_KINDS`, `SYMBOLOGY_META`,
  `QR_ERROR_CORRECTION_META`, `PAYLOAD_KINDS`, `isPayloadCompatible`,
  `decodeRenderResponse`, `decodeRenderError`, `describeRenderError`。

  `RenderRequest` を組み立てる実例が
  `features/generate/ui/generate-screen.tsx` の `buildRequest`（**285 行目付近**）に
  ある。**そこを読んで、同じ形の値を作ること**（`style` には
  `foreground` / `background` / `scale` / `quiet_zone` / `module_shape` /
  `bar_height` / `human_readable` が要る）。

- `features/scan/contract/index.ts` — 読み取りの型と検証。

  ```ts
  // features/scan/contract/decode.ts:15-35
  export type DecodeHints = {
    readonly symbologies: readonly ScanSymbology[]
    readonly multiple: boolean
    readonly try_harder: boolean
  }

  export type Detection = {
    readonly text: string
    readonly symbology: ScanSymbology
    readonly corners: readonly Corner[]
  }

  export type DecodeResponse = {
    readonly detections: readonly Detection[]
  }
  ```

  `MAX_IMAGE_DIMENSION = 4096`、`decodeScanResponse` / `decodeScanError` /
  `describeScanFailure` も公開されている。

- `features/scan/ui/browser-scan.ts:50-56` — 既存の画像デコード。
  **バイト列を wasm に渡すだけで、サーバには送らない。**

  ```ts
  export const browserImageDecoder = (): DecodeImageFile => async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return decodeBytes(bytes, fileHints)
  }
  ```

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない。** `.oxlintrc.json` の
  `qrcc/*` ルールが落とす。回避せず設計を直すこと（`as const` は許可）。
- **ドメイン層（`shared/contract` / `features/*/contract` / `features/*/core`）で
  `throw` しない。** 失敗は `Result<T, E>` で返す。
- **依存（時計・乱数・fetch・DOM）は関数引数で受け取る。** 配線は composition
  root だけ。この計画では `document.modelContext` も**引数で受け取る**設計にする。
- **feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する。**
  相対パスで他 feature の内部に手を伸ばさない（ADR-0007）。
- **実装より先に失敗するテストを書く**（red → green）。
- コメントと識別子の方針: **コメントは日本語**、識別子とログは英語。
  既存ファイルのコメント密度に合わせること。

`Result` 型は `@qrcc/contract` にある。使用例は
`features/scan/ui/browser-scan.ts:38-47`（`ok` / `err` を使って値で返している）。

テストの書き方の手本は `shared/wasm/src/index.test.ts`。
`bun:test` の `describe` / `test` / `expect`、偽物を引数で渡す形。

## Commands you will need

| 目的                                | コマンド                                                 | 成功時                 |
| ----------------------------------- | -------------------------------------------------------- | ---------------------- |
| 依存インストール                    | `bun install`                                            | exit 0                 |
| 型検査                              | `bun run typecheck`                                      | exit 0、エラー出力なし |
| 単体テスト（全体）                  | `bun run test`                                           | 全 pass                |
| 単体テスト（絞る）                  | `bun test shared/webmcp features/generate features/scan` | 全 pass                |
| lint + fmt + 型 + markuplint + rust | `bun run check`                                          | exit 0                 |
| e2e                                 | `bun run e2e`                                            | 全 pass                |

`bun run check` はコミット前に必ず通すこと。

## Scope

**In scope**（変更してよいファイル）:

- `shared/webmcp/package.json`（新規）
- `shared/webmcp/tsconfig.json`（新規）
- `shared/webmcp/src/index.ts`（新規）
- `shared/webmcp/src/index.test.ts`（新規）
- `features/generate/ui/webmcp-tools.ts`（新規）
- `features/generate/ui/webmcp-tools.test.ts`（新規）
- `features/generate/ui/index.ts`（エクスポート追記）
- `features/generate/package.json`（依存追記）
- `features/scan/ui/webmcp-tools.ts`（新規）
- `features/scan/ui/webmcp-tools.test.ts`（新規）
- `features/scan/ui/index.ts`（エクスポート追記）
- `features/scan/package.json`（依存追記）
- `features/shell/ui/home.route.tsx`（登録の配線）
- `features/shell/package.json`（依存追記）
- `tsconfig.json`（参照追記）
- `e2e/tests/webmcp.spec.ts`（新規）
- `docs/adr/0010-webmcp.md`（新規）
- `docs/adr/README.md`（索引に 1 行追記）

**Out of scope**（関係ありそうでも触らないこと）:

- `features/generate/ui/generate-screen.tsx` と
  `features/scan/ui/scan-screen.tsx` — **画面の状態をツールから動かさない。**
  v1 ではツールは計算して結果を返すだけにする（理由は「Maintenance notes」）。
  画面を触ろうとすると状態のリフトアップが必要になり、この計画の範囲を超える。
- `features/manage/**` — 保存・一覧・共有はツールにしない。認証が要り、
  D1 書き込みと Worker リクエストが発生して無料枠を消費する（オーナーの決定）。
- `apps/api/**`、`apps/web/wrangler.jsonc` — WebMCP は完全に client-side。
  サーバ側の変更は一切不要。
- Origin Trial トークンの meta タグやヘッダ — 今回は登録しない（オーナーの決定）。
- `webmcp-types` npm パッケージの追加 — 0.x で変動が激しいため、
  自前の最小構造型を使う。

## Git workflow

- ブランチ: `feat/webmcp`
- コミットは Conventional Commits。`commit-msg` フックが検証する。
  例（実際の履歴から）:
  `feat(shell): トップページで生成と読み取りを両方できるようにする`
- 細かい単位で頻繁にコミットすること。
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: `shared/webmcp` パッケージの骨格を作る

`shared/webmcp/package.json`:

```json
{
  "name": "@qrcc/webmcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --build",
    "test": "bun test"
  },
  "dependencies": {
    "@qrcc/contract": "workspace:*"
  }
}
```

`shared/webmcp/tsconfig.json`（`shared/wasm/tsconfig.json` と同じ形にする）:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["es2024", "dom"]
  },
  "include": ["src/**/*"]
}
```

ルートの `tsconfig.json` の `references` に `{ "path": "./shared/webmcp" }` を
`./shared/wasm` の**次**に追加する。

**Verify**: `bun install` → exit 0。
`bun pm ls 2>/dev/null | grep -c '@qrcc/webmcp'` → `1` 以上。

### Step 2: 登録層の失敗するテストを書く（red）

`shared/webmcp/src/index.test.ts` を作る。手本は `shared/wasm/src/index.test.ts`。

この層が満たすべきこと:

1. `modelContext` が `undefined`（= WebMCP 非対応環境）のとき、
   **何も起きず、成功を返す**。例外を投げない。
2. 対応環境では、渡したツールの数だけ `registerTool` が呼ばれる。
3. `registerTool` が reject しても**例外を投げず、失敗を値で返す**
   （`NotAllowedError` を含む）。
4. 返された解除関数を呼ぶと `AbortController` が abort される。
5. **`exposedTo` を一切渡さない**（オプションに含まれないことを確認する）。

**Verify**: `bun test shared/webmcp` → 5 件中 5 件が **fail**（実装が無いため）。

### Step 3: 登録層を実装する（green）

`shared/webmcp/src/index.ts` に、DOM に触らない純粋な登録層を書く。

型は**自前の最小構造型**にする（`webmcp-types` に依存しない。`any` も `as` も
使わない）:

```ts
/** ツールが返す中身。WebMCP の `content` 配列。 */
export type WebMcpToolResult = {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
}

export type WebMcpTool = {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly execute: (input: Readonly<Record<string, unknown>>) => Promise<WebMcpToolResult>
}

/**
 * ブラウザが提供する `document.modelContext` の、この層が使う部分だけ。
 * 実物に依存しないので、テストでは偽物を渡せる。
 */
export type ModelContext = {
  readonly registerTool: (
    tool: WebMcpTool,
    options: { readonly signal: AbortSignal },
  ) => Promise<unknown>
}
```

公開する関数:

- `registerTools(context: ModelContext | undefined, tools: readonly WebMcpTool[]):
Promise<Result<() => void, WebMcpRegisterError>>`
  - `context` が `undefined` なら、**何もせず** `ok(() => {})` を返す。
  - `AbortController` を 1 つ作り、全ツールを同じ signal で登録する。
  - `registerTool` の reject は `try` / `catch` で捕まえ、
    `err({ kind: 'register_failed', detail })` にする。**呼び出し元に throw しない。**
  - 成功したら `ok(() => controller.abort())` を返す。
- `textResult(text: string): WebMcpToolResult` — `{ content: [{ type: 'text', text }] }`
  を作るだけの補助。
- `browserModelContext(): ModelContext | undefined` — **ここだけが DOM を見る。**
  `typeof document !== 'undefined'` かつ `modelContext` が関数を持つときだけ返す。
  SSR とハイドレーション前は必ず `undefined`。
  `as` を使わずに絞り込むこと（`in` 演算子と `typeof` で判定する）。

**Verify**: `bun test shared/webmcp` → 5 件すべて pass。
`bun run typecheck` → exit 0。

### Step 4: 生成ツールの失敗するテストを書く（red）

`features/generate/ui/webmcp-tools.test.ts` を作る。

`makeGenerateTool(render: RenderFn): WebMcpTool` を検証する。`RenderFn` は
`features/generate/ui/generate-screen.tsx` が公開している既存の型で、
`@qrcc/generate/ui` から import できる。テストでは偽物を渡す。

covering:

1. `name` が `generate-code`、`description` が日本語で用途を説明している。
2. `inputSchema` が `type: 'object'` で、`text` が `required` に入っている。
3. `execute({ text: 'https://example.com' })` が `render` を 1 回呼び、
   組み立てた `RenderRequest` の `payload` が `{ kind: 'url', url: ... }` になる。
4. `symbology` を省略すると `qr` になる。
5. `text` が URL として不正なとき、`payload.kind` が `text` にフォールバックする
   （エージェントは種別を間違えるので、拒否せず素直に扱う）。
6. `render` が失敗を返したとき、**例外を投げず**、`content[0].text` に
   `describeRenderError` の文言が入る。
7. 返す本文に `description`（読み上げ用テキスト）と大きさが含まれる。
8. `includeSvg: true` のときだけ SVG 本文を含める（既定は含めない。
   数 KB の SVG を毎回返すとエージェントの文脈を食い潰すため）。

**Verify**: `bun test features/generate/ui/webmcp-tools.test.ts` → 全 fail。

### Step 5: 生成ツールを実装する（green）

`features/generate/ui/webmcp-tools.ts` を作る。

- `RenderRequest` の組み立ては
  `features/generate/ui/generate-screen.tsx` の `buildRequest` と**同じ形**にする。
  そこを読んで `style` の全フィールドを埋めること。
- 入力の検証は `@qrcc/contract` の `parseHttpUrl` / `parseNonEmptyText` を使う
  （自前で正規表現を書かない）。
- 失敗は `describeRenderError` で日本語にして返す。
- `features/generate/ui/index.ts` に
  `export { makeGenerateTool } from './webmcp-tools.ts'` を追記。
- `features/generate/package.json` の `dependencies` に
  `"@qrcc/webmcp": "workspace:*"` を追記。

**Verify**: `bun test features/generate/ui/webmcp-tools.test.ts` → 全 pass。
`bun run typecheck` → exit 0。

### Step 6: 読み取りツールの失敗するテストを書く（red）

`features/scan/ui/webmcp-tools.test.ts` を作る。

`makeDecodeTool(decodeBytes)` を検証する。`decodeBytes` は
`(bytes: Uint8Array) => Promise<Result<DecodeResponse, ScanFailure>>` を引数で受け取る
（DOM にも wasm にも依存させない）。

covering:

1. `name` が `decode-code-image`。
2. **`data:` 以外の URL を拒否する。** `https://…` を渡したら
   `decodeBytes` を呼ばず、拒否理由を返す。
   → これは**セキュリティ要件**。任意 URL を取りに行けると、利用者のブラウザを
   踏み台にして社内ネットワークや認証付きリソースを読ませられる。
3. base64 が壊れた `data:` URL を渡しても**例外を投げず**、理由を返す。
4. 上限（4 MB）を超えるバイト列を拒否し、`decodeBytes` を呼ばない。
5. 正常な `data:image/png;base64,...` で `decodeBytes` が 1 回呼ばれる。
6. 検出結果が 0 件のとき「見つからなかった」旨を返す。
7. 検出結果が複数のとき、全部の `text` と `symbology` が本文に入る。
8. `decodeBytes` が失敗を返したとき、`describeScanFailure` の文言を返す。
9. **解釈結果が本文に入る。** `WIFI:S:MyNet;T:WPA;P:secret;;` を読ませたら、
   `interpret`（`@qrcc/scan/core`）が返した構造化結果が本文に含まれること。
   **生テキストも同時に含まれること**（解釈が外れても元が失われない）。

**Verify**: `bun test features/scan/ui/webmcp-tools.test.ts` → 全 fail。

### Step 7: 読み取りツールを実装する（green）

`features/scan/ui/webmcp-tools.ts` を作る。

- `data:` URL のパースは自前で行う（`fetch` を使わない。使うと将来
  `https:` を通す改変が入りやすくなる）。
  `data:<mime>;base64,<payload>` だけを受け付け、`base64` 以外は拒否する。
- バイト上限は定数 `MAX_IMAGE_BYTES = 4 * 1024 * 1024` として書き、
  コメントで「サーバ側デコードの上限（`docs/free-tier-budget.md`）と揃える」と残す。
- `features/scan/ui/index.ts` に
  `export { makeDecodeTool } from './webmcp-tools.ts'` を追記。
- `features/scan/package.json` の `exports` に `"./core": "./core/index.ts"` を
  追記（`interpret` を composition root から使えるようにするため）。
- `features/scan/package.json` の `dependencies` に
  `"@qrcc/webmcp": "workspace:*"` を追記。

**Verify**: `bun test features/scan/ui/webmcp-tools.test.ts` → 全 pass。

### Step 8: トップページで登録する

`features/shell/ui/home.route.tsx` に登録を足す。

- `useEffect` の中で `browserModelContext()` を呼び、`registerTools` する。
- クリーンアップで解除関数を呼ぶ。
- **`GenerateSection` / `ScanSection` の中身は変えない。**
- 生成ツールに渡す `RenderFn` と、読み取りツールに渡す `decodeBytes` は、
  この route ファイル（composition root）で組み立てる。
  ブラウザ側 wasm は `@qrcc/wasm` の `makeWasmRenderer(loadBrowserWasm)` /
  `makeWasmDecoder(loadBrowserDecoder)` から作る。**遅延読み込みのままにすること**
  （モジュールを import しただけで wasm を取りに行かせない）。
- `features/shell/package.json` の `dependencies` に
  `"@qrcc/webmcp": "workspace:*"`、`"@qrcc/scan": "workspace:*"` を追記
  （`@qrcc/generate` は既にある）。

**Verify**: `bun run typecheck` → exit 0。`bun run test` → 全 pass。

### Step 9: 非対応環境で何も変わらないことを e2e で固定する

`e2e/tests/webmcp.spec.ts` を作る。手本は `e2e/tests/a11y.spec.ts` の書き方。

1. `document.modelContext` が無い既定の Chromium で `/` を開き、
   **コンソールにエラーが出ないこと**と、生成プレビューが従来どおり出ることを確認する。
2. `page.addInitScript` で偽の `document.modelContext` を注入し、
   `registerTool` の呼び出しを記録する。`/` を開いたあと、
   `generate-code` と `decode-code-image` の 2 つが登録されることを確認する。
3. 注入した偽 `modelContext` 経由で `generate-code` を実行し、
   返り値の `content[0].text` に生成結果の説明が入ることを確認する。
4. **wasm を先読みしていないこと**を確認する。`/` を開いた直後の
   `performance.getEntriesByType('resource')` に `qrcc_scan_wasm` が
   含まれないこと（読み取りツールを呼ぶまで取りに行かない）。

**Verify**: `bun run e2e` → 全 pass（既存 320 件 + 新規 4 件 × 4 プロジェクト）。

### Step 10: ADR を書く

`docs/adr/0010-webmcp.md` に、既存の ADR（`docs/adr/0009-stay-on-workers-free.md`
が直近の手本）と同じ体裁で記録する。最低限これを書くこと:

- **文脈**: WebMCP は 2026-09 時点で Origin Trial（Chrome 149 / Edge 150）。
  既定では有効でない。
- **決定**: 生成と読み取りだけをツールにする。保存・一覧・共有は出さない。
  Origin Trial トークンは登録しない。`exposedTo` は使わない。
- **理由**: 生成と読み取りは端末内で完結し、認証も副作用も無く、
  Worker も D1 も消費しない（ADR-0003 / ADR-0009 と整合）。
  保存系は認証が要り、エージェントが共有リンクを作れる経路になる。
- **帰結**: API が無い環境では何も起きない。仕様が正式化したら自動的に効く。
  `data:` 以外の URL を読み取りツールに通してはならない（踏み台防止）。

`docs/adr/README.md` の表に 1 行追記する。

**Verify**: `bun run check` → exit 0（markdown のフォーマットも通ること）。

## Test plan

| ファイル                                    | 新規テスト                                                                | 手本                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `shared/webmcp/src/index.test.ts`           | 5 件（非対応時の no-op、登録数、reject の値化、解除、`exposedTo` 不使用） | `shared/wasm/src/index.test.ts`                 |
| `features/generate/ui/webmcp-tools.test.ts` | 8 件（Step 4 の一覧）                                                     | `features/generate/ui/generate-screen.test.tsx` |
| `features/scan/ui/webmcp-tools.test.ts`     | 8 件（Step 6 の一覧。うち 3 件がセキュリティ）                            | `features/scan/ui/scan-screen.test.tsx`         |
| `e2e/tests/webmcp.spec.ts`                  | 4 件（Step 9 の一覧）                                                     | `e2e/tests/a11y.spec.ts`                        |

**すべて red → green の順で書くこと。** 実装を先に書いたら、いったん実装を
戻してテストが落ちることを確認してから進めること。

検証: `bun run test` → 既存 625 件 + 新規 21 件がすべて pass。

## Done criteria

機械的に確認できること。**すべて**満たすこと:

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0。新規 21 件が存在して pass する
- [ ] `bun run e2e` が exit 0
- [ ] `grep -rn "exposedTo" shared features` が **0 件**
- [ ] `grep -rn "webmcp-types" package.json */*/package.json` が **0 件**
- [ ] `grep -rnE "\bas\b [A-Z]|: any\b" shared/webmcp features/*/ui/webmcp-tools.ts` が **0 件**
- [ ] `features/scan/ui/webmcp-tools.ts` に `fetch(` が **無い**こと
      （`grep -c 'fetch(' features/scan/ui/webmcp-tools.ts` → 0）
- [ ] In scope 以外のファイルが変更されていない（`git status`）
- [ ] `plans/README.md` の 001 の行が DONE になっている

## STOP conditions

止めて報告すること（勝手に判断しない）:

- Drift check で「Current state」の引用と実際のコードが食い違っている。
- `RenderRequest` の組み立てが `buildRequest` と同じ形にできない
  （`style` のフィールドが増減しているなど）。
- `document.modelContext` の API が、この計画に書いた形と違うことが判明した
  （仕様が動いた場合。<https://github.com/webmachinelearning/webmcp> を確認して報告）。
- ツールから画面の状態を動かしたくなった。**それは範囲外**。必要だと判断したら
  実装せず報告すること。
- 検証コマンドが、妥当な修正を 1 回試しても 2 回連続で失敗する。
- `@qrcc/webmcp` を `features/*/contract` や `features/*/core` から
  参照したくなった。ドメイン層はブラウザ API を知ってはいけない。

## Maintenance notes

- **v1 のツールは画面を触らない。** 計算して結果を返すだけ。WebMCP の本来の
  価値は「エージェントが画面を動かし、利用者がその結果を見る」協調作業なので、
  次の一手は `GenerateScreen` の状態をリフトアップして、ツールからフォームを
  埋められるようにすること。**それには画面の状態管理の変更が要る**ため、
  この計画からは意図的に外してある。
- **Origin Trial トークンを後から入れる場合**は、`features/shell/ui/root-document.tsx`
  の `<head>` に `<meta http-equiv="origin-trial" content="…">` を足すか、
  `apps/web/wrangler.jsonc` で `Origin-Trial` ヘッダを返す。トークンは
  オリジンごと・期限つきで、失効すると静かに無効になるので、
  入れるなら失効日を運用メモに残すこと。
- **レビューで特に見るべき点**: 読み取りツールが `data:` 以外を絶対に受け付けない
  こと。ここが緩むと、利用者のブラウザを踏み台にして任意の URL を読ませられる。
- 保存・一覧・共有をツールにしたくなったら、**先に認可の設計をやり直すこと**。
  エージェントが利用者の確認なしに共有リンクを作れる経路を作ってはいけない。
- `webmcp-types` を将来使うなら、完全固定バージョンで入れること（0.x）。
