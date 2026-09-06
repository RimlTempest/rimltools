# 関数DI（DIP）とクラスを使わない設計

## なぜクラスを使わないか

- 継承ツリーが暗黙の依存を作る（LSP 違反の温床）
- `this` の束縛でテストが壊れる
- DI コンテナやデコレータが必要になり、型が `any` に落ちやすい
- クロージャで同じことができ、型推論がよく効く

**唯一の例外**: Durable Object は Cloudflare の要件で `class X extends DurableObject`
でなければ export できない（[ADR-0004](../../../../docs/adr/0004-durable-object-class-exception.md)）。
`features/sync/worker/document-room.ts` だけが class を書いてよく、
メソッド本体は 1〜3 行で `features/sync/core` の関数に委譲する。
ロジックを class に書き始めたら設計が壊れている。

## 基本形: 2 段カリー化

```ts
// 1. 利用側が「必要なもの」だけを型で宣言する（ISP）
type CreateDocumentDeps = {
  readonly newId: () => Result<DocumentId, 'invalid_document_id'>
  readonly now: () => Date
  readonly insertDocument: (doc: Document) => Promise<Result<void, RepoError>>
}

// 2. 依存 → 入力 → 結果
export const makeCreateDocument =
  (deps: CreateDocumentDeps) =>
  async (owner: UserId, input: NewDocument): Promise<Result<Document, CreateDocumentError>> => {
    const id = deps.newId()
    if (!id.ok) return err({ kind: 'id_generation_failed' })
    const at = deps.now()
    const doc: Document = { ...input, id: id.value, ownerId: owner, createdAt: at, updatedAt: at }
    const saved = await deps.insertDocument(doc)
    return saved.ok ? ok(doc) : err({ kind: 'repo', cause: saved.error })
  }

export type CreateDocument = ReturnType<typeof makeCreateDocument>
```

## 状態を持つもの（旧: クラス）

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

- 返すのは **型で定義された振る舞いの集合**。内部状態はクロージャに閉じる。
- 「継承したい」と思ったら、代わりに関数を受け取る（合成）。
- Durable Object の in-memory 状態は hibernation で消える。クロージャの状態も同じ。
  **消えて困るものは `ctx.storage` に、消えてよいものだけクロージャに**。

## Composition Root

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
// apps/sync/src/index.ts（Durable Object 側。class の中で core の関数を組み立てる）
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

## テスト

```ts
test('新規作成すると id と日時が採番される', async () => {
  const inserted: Document[] = []
  const createDocument = makeCreateDocument({
    newId: () => parseDocumentId('doc_000000000000000000000001'),
    now: () => new Date('2026-09-01T00:00:00Z'),
    insertDocument: async (d) => {
      inserted.push(d)
      return ok(undefined)
    },
  })
  const r = await createDocument(ownerId, newDocument)
  expect(r.ok).toBe(true)
  expect(inserted).toHaveLength(1)
})
```

モックライブラリ不要。フェイクは素のオブジェクト・素の関数。
「モックが書きにくい」は依存の切り方が間違っているサイン。
