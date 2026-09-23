# noter の TypeScript 固有事項

共通の規約は `rimltools-typescript`。ここには noter だけの例外・レイヤ・例を置く（統合前の `noter-typescript` から移した）。

## Durable Object の class 例外（ADR-0004）

**唯一の例外**: Durable Object は Cloudflare の要件で `class X extends DurableObject`
でなければ export できない（[ADR-0004](../../../../docs/adr/0004-durable-object-class-exception.md)）。
`features/sync/worker/document-room.ts` だけが class を書いてよく、
メソッド本体は 1〜3 行で `features/sync/core` の関数に委譲する。
ロジックを class に書き始めたら設計が壊れている。

## モジュール境界（noter のレイヤ）

```
shared/contract           … 型と Result のみ。実装依存ゼロ。誰からも import される
features/<name>/contract  … その feature の公開型と Result（実装依存ゼロ）
features/<name>/core      … 純粋ドメインロジック。I/O 禁止。Yjs のような純粋ライブラリは可
features/<name>/server    … D1 / Better Auth を触るサーバ側アダプタ
features/sync/worker      … Durable Object アダプタ（唯一 class を許す場所）
apps/*/src/server   … I/O（D1・Durable Object binding）と composition root
features/<name>/ui    … UI。ドメイン型をそのまま使う。`*.route.tsx` だけが env に触れてよい
```

`import/no-cycle` は error。feature 同士は `@noter/<name>/<subpath>` の公開サブパス経由でのみ依存する（相対パスで隣の feature に手を伸ばさない）。

## composition root は 2 か所

配線は 1 箇所に集約する。ここだけが具体実装を知っている。noter には 2 つある。

```ts
// features/documents/ui/documents-wiring.route.ts（web Worker 側。server function から呼ぶ）
export const makeDocumentsDeps = (env: CloudflareEnv) => {
  const sql = makeD1SqlRunner(env.DB)
  const repo = makeD1DocumentRepo(sql)
  const createDocument = makeCreateDocument({
    newId: () => newDocumentId(() => randomBase32(crypto.getRandomValues, 24)),
    now: () => new Date(),
    insertDocument: repo.insert,
  })
  return { createDocument, listDocuments: makeListDocuments({ findByMember: repo.findByMember }) } as const
}
```

```ts
// services/sync/src/index.ts（Durable Object 側。class の中で core の関数を組み立てる）
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  readonly #room: Room
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env)
    this.#room = makeRoom({ storage: ctx.storage, sockets: () => ctx.getWebSockets(), now: () => new Date() })
  }
  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) { return this.#room.onMessage(ws, message) }
}
```

ルート/server function は deps から関数を受け取るだけ。`env` を直接触らない。

## クロージャで状態を持つ例（PersistScheduler）と hibernation

```ts
type PersistScheduler = {
  readonly markDirty: () => void
  readonly flush: () => Promise<Result<void, PersistError>>
}

export const makePersistScheduler = (deps: {
  readonly scheduleAlarm: (delayMs: number) => Promise<void>
  readonly writeState: (state: Uint8Array) => Promise<Result<void, PersistError>>
  readonly encodeState: () => Uint8Array
  readonly delayMs: number
}): PersistScheduler => {
  let dirty = false
  let alarmSet = false
  const markDirty = () => {
    dirty = true
    if (!alarmSet) {
      alarmSet = true
      void deps.scheduleAlarm(deps.delayMs)
    }
  }
  const flush = async () => {
    alarmSet = false
    if (!dirty) return ok(undefined)
    dirty = false
    return deps.writeState(deps.encodeState())
  }
  return { markDirty, flush }
}
```

- Durable Object の in-memory 状態は hibernation で消える。クロージャの状態も同じ。
  **消えて困るものは `ctx.storage` に、消えてよいものだけクロージャに**。

## Result と WebSocket close code の対応

`features/sync/core` は `Result` を返す純粋関数の集合で、Durable Object の
ハンドラ（`features/sync/worker`）が唯一の変換点。WebSocket 越しにクライアントへ
返すエラーは **close code + 短い reason** に落とす（本文は出さない）:

| `error.kind`        | close code | reason        |
| ------------------- | ---------- | ------------- |
| `forbidden`         | 4403       | `forbidden`   |
| `not_found`         | 4404       | `not_found`   |
| `message_too_large` | 4413       | `too_large`   |
| `limit_exceeded`    | 4429       | `limit`       |

対応表は `features/sync/contract/src/close-codes.ts` に置き、クライアント
（`features/sync/client`）とサーバ（`features/sync/worker`）の両方が同じ定数を読む。

## 型の例（noter のドメイン）

共通 skill の例（qrcc）に対応する noter の例。

### Branded Primitive / ID（`unique symbol`）

素の `string` を混ぜないための最小コスト。ブランドは値としては存在しない。

```ts
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type DocumentId = Brand<string, 'DocumentId'>
export type UserId = Brand<string, 'UserId'>
export type ShareToken = Brand<string, 'ShareToken'>
```

**作り方は必ずパース関数経由**（`as` は禁止なので、唯一の生成点を型ガードで作る）。

```ts
const isDocumentId = (v: string): v is DocumentId => /^doc_[0-9a-hjkmnp-tv-z]{24}$/.test(v)

export const parseDocumentId = (v: string): Result<DocumentId, 'invalid_document_id'> =>
  isDocumentId(v) ? ok(v) : err('invalid_document_id')
```

新規発行は「生成器が返す値をそのまま型ガードに通す」。

```ts
export const newDocumentId = (
  randomBase32: () => string,
): Result<DocumentId, 'invalid_document_id'> => parseDocumentId(`doc_${randomBase32()}`)
```

### 検証済み文字列（Branded Primitive）

```ts
export type DocumentTitle = Brand<string, 'DocumentTitle'> // 1〜120 文字、改行なし
export type DisplayName = Brand<string, 'DisplayName'> // 1〜32 文字。presence に出す名前

const isDocumentTitle = (v: string): v is DocumentTitle =>
  v.length >= 1 && v.length <= 120 && !/[\r\n]/.test(v)
```

これで「タイトルを検証してから保存する」ことがシグネチャで強制される:
`renameDocument(id: DocumentId, title: DocumentTitle)` は未検証文字列を受け取れない。

---

### Discriminated Union

「種類ごとに持つデータが違う」ものはすべてこれ。optional の寄せ集めにしない。

```ts
// 同期接続の状態。UI の表示・再接続ボタンの有無がここで決まる
export type ConnectionState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected'; readonly since: Date }
  | { readonly kind: 'reconnecting'; readonly attempt: number; readonly nextAt: Date }
  | { readonly kind: 'offline'; readonly reason: 'network' | 'closed_by_server' }
  | { readonly kind: 'rejected'; readonly reason: 'forbidden' | 'not_found' | 'limit' }

// フォーマット診断。yaml/toml/json のパースエラーと markdown の mermaid エラーを 1 つの型で
export type Diagnostic =
  | { readonly kind: 'syntax'; readonly line: number; readonly column: number; readonly message: string }
  | { readonly kind: 'mermaid'; readonly blockIndex: number; readonly message: string }
  | { readonly kind: 'duplicate_key'; readonly line: number; readonly key: string }
```

`rejected` のときだけ `reason` が権限系である、を `Exclude`/union で表す — コメントではなく型で。

### 網羅性は `switch` + `never`

```ts
const statusLabel = (s: ConnectionState): string => {
  switch (s.kind) {
    case 'connecting':
      return '接続中'
    // ...
    default:
      return assertNever(s)
  }
}
export const assertNever = (v: never): never => {
  throw new Error(`unhandled: ${JSON.stringify(v)}`)
}
```

`assertNever` はドメイン層の外（アダプタ層）に置く。`switch-exhaustiveness-check` が
error なので、union にメンバーを足すと未対応箇所が全部落ちる。これが OCP の担保。
**`default` 節は `switch-exhaustiveness-check` を満たさない**（qrcc で確認済み）。
`default: return assertNever(s)` のように never 引数で受けるか、全ケースを列挙する。

---

### Utility Types

派生型は手書きしない。元の型が変わったら派生も自動で追随させる。

```ts
export type Document = {
  readonly id: DocumentId
  readonly ownerId: UserId
  readonly title: DocumentTitle
  readonly kind: DocumentKind // 'markdown' | 'yaml' | 'toml' | 'json'
  readonly createdAt: Date
  readonly updatedAt: Date
}

// 作成時は id と日時をサーバが決める
export type NewDocument = Omit<Document, 'id' | 'createdAt' | 'updatedAt'>
// 更新は部分適用、ただし所有者と種別は変えられない
export type DocumentPatch = Partial<Pick<Document, 'title'>>
// 一覧に必要な列だけ
export type DocumentSummary = Pick<Document, 'id' | 'title' | 'kind' | 'updatedAt'> & {
  readonly role: MemberRole
}
```

よく使うもの: `Omit` `Pick` `Partial` `Required` `Readonly` `Extract` `Exclude`
`NonNullable` `Awaited` `Parameters` `ReturnType` `Record`。

---

### Conditional / Mapped Types

「文書種別ごとにパーサ・整形・拡張子・MIME が違う」を 1 つの型関数で表す。

```ts
export type FormatSupport = {
  readonly extensions: readonly string[]
  readonly mime: string
  readonly diagnose: (text: string) => readonly Diagnostic[]
  readonly format: (text: string) => Result<string, Diagnostic>
}

// 文書種別 → フォーマット実装、を型安全に持つレジストリ
type FormatRegistry = { readonly [K in DocumentKind]: FormatSupport }

export const formats: FormatRegistry = {
  markdown: markdownSupport,
  yaml: yamlSupport,
  toml: tomlSupport,
  json: jsonSupport,
  // ここに 1 行足し忘れるとコンパイルエラー = 新種別の追加漏れを防ぐ
}
```

レジストリを Mapped Type で持つと、「union にメンバーを足したのに実装を足していない」
が必ずコンパイルエラーになる。**これが拡張性の中核**。

### テンプレートリテラル型

```ts
type HexColor = `#${string}`
type Route = `/d/${string}` | `/s/${string}` | '/' | '/sign-in'
```

---

## チェックリスト（noter 固有）

- [ ] I/O に Durable Object storage・WebSocket を含めて引数で受け取っている
- [ ] 新しい文書種別（フォーマット）を「新ファイル + レジストリ 1 行」で足せる（OCP）
- [ ] 境界値（空文書、最大サイズ、1 バイト超過、不正 UTF-8、深いネスト）を含む
