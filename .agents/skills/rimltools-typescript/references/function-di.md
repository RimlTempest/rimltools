# 関数DI（DIP）とクラスを使わない設計

## なぜクラスを使わないか

- 継承ツリーが暗黙の依存を作る（LSP 違反の温床）
- `this` の束縛でテストが壊れる
- DI コンテナやデコレータが必要になり、型が `any` に落ちやすい
- クロージャで同じことができ、型推論がよく効く

## 基本形: 2 段カリー化

```ts
// 1. 利用側が「必要なもの」だけを型で宣言する（ISP）
type CreateCodeDeps = {
  readonly newId: () => Result<CodeId, 'invalid_code_id'>
  readonly now: () => Date
  readonly insertCode: (code: Code) => Promise<Result<void, RepoError>>
}

// 2. 依存 → 入力 → 結果
export const makeCreateCode =
  (deps: CreateCodeDeps) =>
  async (owner: UserId, input: NewCode): Promise<Result<Code, CreateCodeError>> => {
    const id = deps.newId()
    if (!id.ok) return err({ kind: 'id_generation_failed' })
    const at = deps.now()
    const code: Code = { ...input, id: id.value, ownerId: owner, createdAt: at, updatedAt: at }
    const saved = await deps.insertCode(code)
    return saved.ok ? ok(code) : err({ kind: 'repo', cause: saved.error })
  }

export type CreateCode = ReturnType<typeof makeCreateCode>
```

## 状態を持つもの（旧: クラス）

```ts
type RateLimiter = {
  readonly check: (key: string) => Promise<Result<void, 'rate_limited'>>
}

export const makeKvRateLimiter = (
  kv: KVNamespace,
  limit: number,
  windowSec: number,
): RateLimiter => {
  const check = async (key: string) => {
    /* kv を使う */
  }
  return { check }
}
```

- 返すのは **型で定義された振る舞いの集合**。内部状態はクロージャに閉じる。
- 「継承したい」と思ったら、代わりに関数を受け取る（合成）。

## Composition Root

配線は 1 箇所に集約する。ここだけが具体実装を知っている。

```ts
// apps/web/src/server/container.ts
export const makeContainer = (env: Env) => {
  const repo = makeD1CodeRepo(env.DB)
  const createCode = makeCreateCode({ newId: () => newCodeId(crypto.randomUUID), now: () => new Date(), insertCode: repo.insert })
  return { createCode, listCodes: makeListCodes({ ... }) } as const
}
export type Container = ReturnType<typeof makeContainer>
```

ルート/server function は `Container` から関数を受け取るだけ。`env` を直接触らない。

## テスト

```ts
test('新規作成すると id と日時が採番される', async () => {
  const inserted: Code[] = []
  const createCode = makeCreateCode({
    newId: () => parseCodeId('cd_000000000000000000000001'),
    now: () => new Date('2026-09-01T00:00:00Z'),
    insertCode: async (c) => {
      inserted.push(c)
      return ok(undefined)
    },
  })
  const r = await createCode(ownerId, newCode)
  expect(r.ok).toBe(true)
  expect(inserted).toHaveLength(1)
})
```

モックライブラリ不要。フェイクは素のオブジェクト・素の関数。
「モックが書きにくい」は依存の切り方が間違っているサイン。
