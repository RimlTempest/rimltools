/**
 * Branded Primitive / ID。素の string を取り違えないようにする。
 * 値としてのブランドは存在せず、実行時コストはゼロ。
 *
 * `as` は禁止されているため、生成は必ず型ガードを通したパース関数で行う。
 * 詳細: .claude/skills/qrcc-typescript/references/type-patterns.md
 */
import type { Result } from './result.ts'

declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

/**
 * 型ガードから「パース関数」を作る。Branded 型の唯一の生成点。
 *
 * @example
 * const parseCodeId = makeParser<string, CodeId, 'invalid_code_id'>(
 *   (v): v is CodeId => /^cd_[0-9a-z]{24}$/.test(v),
 *   'invalid_code_id',
 * )
 */
export const makeParser =
  <Input, Output extends Input, ErrorKind extends string>(
    guard: (value: Input) => value is Output,
    errorKind: ErrorKind,
  ) =>
  (value: Input): Result<Output, ErrorKind> =>
    guard(value) ? { ok: true, value } : { ok: false, error: errorKind }
