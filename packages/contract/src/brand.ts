/**
 * Branded Primitive / ID。素の string を取り違えないようにする。
 * 値としてのブランドは存在せず、実行時コストはゼロ。
 *
 * `as` は禁止されているため、ブランド付き値の生成点は
 * 「型ガードを通したパース関数」だけになる。
 * 詳細: .claude/skills/rimltools-typescript/references/type-patterns.md
 */
import type { Result } from './result.ts'
import { err, ok } from './result.ts'

declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

/**
 * 型ガードと失敗時のエラー生成から、パース関数を組み立てる。
 * Branded 型の唯一の生成点。
 *
 * @example
 * const parseCodeId = makeParser(
 *   (v: string): v is CodeId => /^cd_[0-9a-z]{24}$/.test(v),
 *   (v) => ({ kind: 'invalid_id', expected: 'cd_…', received: v }),
 * )
 */
export const makeParser =
  <Input, Output extends Input, Failure>(
    guard: (value: Input) => value is Output,
    onInvalid: (value: Input) => Failure,
  ) =>
  (value: Input): Result<Output, Failure> =>
    guard(value) ? ok(value) : err(onInvalid(value))
