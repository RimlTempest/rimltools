/**
 * D1 を使うための最小の入口。実装は `@rimltools/auth/server`（plan 001 段階 3）。
 * 失敗は投げずに `Result` で返す — D1 は制約違反でも例外を投げるので、
 * ここが「例外を値に変える」唯一の場所になる（server は I/O 境界）。
 */
import type { SqlRunner as SharedSqlRunner } from '@rimltools/auth/server'

export type { SqlError, SqlRow, SqlStatement, SqlValue } from '@rimltools/auth/server'
export { makeD1SqlRunner } from '@rimltools/auth/server'

/** qrcc が使うのは `all` と `batch` だけ（テストの偽物もこの 2 つだけを満たせばよい）。 */
export type SqlRunner = Pick<SharedSqlRunner, 'all' | 'batch'>
