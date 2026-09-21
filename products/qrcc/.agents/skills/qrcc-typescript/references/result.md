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
export type RenderError =
  | { readonly kind: 'payload_too_long'; readonly max: number; readonly actual: number }
  | { readonly kind: 'unsupported_charset'; readonly symbology: Symbology['kind'] }
  | { readonly kind: 'invalid_option'; readonly field: string; readonly reason: string }
```

- `kind` は必ず snake_case の安定した識別子。UI 文言はここに入れない。
- 追加情報（`max` / `actual`）を持たせる。「何が悪かったか」をユーザーに出せる。

## 境界での変換

`Result` を持ち回すのはドメイン層まで。外に出るところで一度だけ変換する。

```ts
// HTTP 境界
const toResponse = (r: Result<Code, RenderError>): Response =>
  r.ok ? Response.json(r.value) : Response.json({ error: r.error }, { status: statusOf(r.error) })

// React 境界: server function は throw して error boundary に載せてよい
export const renderCode = createServerFn().handler(async (input) => {
  const r = await deps.render(input)
  if (!r.ok) throw new RenderFailure(r.error) // ここが唯一の throw
  return r.value
})
```

## Rust 側との対応

`features/*/engine` は Rust の `Result<T, E>` をそのまま使い、`E` は `thiserror` の enum。
Worker 境界で `{ "ok": false, "error": { "kind": "...", ... } }` の JSON にシリアライズし、
TS 側の `RenderError` と **同じ `kind` 文字列**で対応させる。
対応表は `shared/contract/src/api/errors.ts` に置き、Rust 側テストと TS 側テストの
両方で同じフィクスチャ JSON を読む。
