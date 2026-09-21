# Result — 失敗を値として扱う

## 定義（`shared/contract/src/result.ts`）

```ts
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok
```

コンビネータは**実際に必要になってから**足す（YAGNI）。最低限:

```ts
export const mapResult = <T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r

export const flatMapResult = <T, U, E, F>(
  r: Result<T, E>,
  f: (v: T) => Result<U, F>,
): Result<U, E | F> => (r.ok ? f(r.value) : r)

export const collectResults = <T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], E> => {
  const out: T[] = []
  for (const r of rs) {
    if (!r.ok) return r
    out.push(r.value)
  }
  return ok(out)
}
```

## エラー型はタグ付きユニオンにする

文字列メッセージを返さない。UI が分岐でき、i18n でき、テストで比較できる形にする。

```ts
export type ImportError =
  | { readonly kind: 'too_large'; readonly maxBytes: number; readonly actualBytes: number }
  | { readonly kind: 'unsupported_extension'; readonly extension: string }
  | { readonly kind: 'not_utf8' }
```

- `kind` は必ず snake_case の安定した識別子。UI 文言はここに入れない。
- 追加情報（`max` / `actual`）を持たせる。「何が悪かったか」をユーザーに出せる。

## 境界での変換

`Result` を持ち回すのはドメイン層まで。外に出るところで一度だけ変換する。

```ts
// HTTP 境界
const toResponse = (r: Result<Document, DocumentError>): Response =>
  r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: statusOf(r.error) })

// React 境界: server function は throw して error boundary に載せてよい
export const createDocument = createServerFn().handler(async (input) => {
  const r = await deps.createDocument(input)
  if (!r.ok) throw new DocumentFailure(r.error) // ここが唯一の throw
  return r.value
})
```

## Durable Object 境界との対応

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
