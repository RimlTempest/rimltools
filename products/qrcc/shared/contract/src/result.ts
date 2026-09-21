/**
 * 失敗を値として扱うための型。ドメイン層では throw せずこれを返す。
 * 詳細: .claude/skills/rimltools-typescript/references/result.md
 */
export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok

export const mapResult = <T, U, E>(result: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  result.ok ? ok(f(result.value)) : result

export const flatMapResult = <T, U, E, F>(
  result: Result<T, E>,
  f: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? f(result.value) : result)

/** 1 件でも失敗したら最初の失敗を返す。 */
export const collectResults = <T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> => {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}
