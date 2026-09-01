/**
 * D1 を使うための最小の入口。
 *
 * 型は**利用側で定義する**（ISP）。`@cloudflare/workers-types` を feature に
 * 引き込まずに済み、テストでは素の SQLite でも同じ形を満たせる。
 * 失敗は投げずに `Result` で返す — D1 は制約違反でも例外を投げるため、
 * ここが「例外を値に変える」唯一の場所になる。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'

export type SqlValue = string | number | null

export type SqlStatement = {
  readonly sql: string
  readonly params: readonly SqlValue[]
}

export type SqlRow = Record<string, unknown>

export type SqlError = {
  readonly kind: 'storage_unavailable'
  readonly detail: string
}

export type SqlRunner = {
  readonly all: (statement: SqlStatement) => Promise<Result<readonly SqlRow[], SqlError>>
  /**
   * 複数文を **1 トランザクション**で実行し、文ごとの変更行数を返す。
   * 「途中まで成功した」状態を作らないために、単発実行の繰り返しでは代用しない。
   */
  readonly batch: (
    statements: readonly SqlStatement[],
  ) => Promise<Result<readonly number[], SqlError>>
}

/** D1 のうち、ここで使う部分だけの形。 */
type D1PreparedLike = {
  readonly bind: (...values: SqlValue[]) => D1PreparedLike
  readonly all: () => Promise<{
    readonly results?: unknown
    readonly meta?: { readonly changes?: number } | undefined
  }>
}

type D1Like = {
  readonly prepare: (query: string) => D1PreparedLike
  readonly batch: (
    statements: D1PreparedLike[],
  ) => Promise<readonly { readonly meta?: { readonly changes?: number } | undefined }[]>
}

const isRow = (value: unknown): value is SqlRow => typeof value === 'object' && value !== null

const toRows = (results: unknown): readonly SqlRow[] =>
  Array.isArray(results) ? results.filter(isRow) : []

export const makeD1SqlRunner = (db: D1Like): SqlRunner => {
  const prepared = (statement: SqlStatement): D1PreparedLike =>
    db.prepare(statement.sql).bind(...statement.params)

  const all = async (statement: SqlStatement): Promise<Result<readonly SqlRow[], SqlError>> => {
    try {
      const outcome = await prepared(statement).all()
      return ok(toRows(outcome.results))
    } catch (cause) {
      return err({ kind: 'storage_unavailable', detail: String(cause) })
    }
  }

  const batch = async (
    statements: readonly SqlStatement[],
  ): Promise<Result<readonly number[], SqlError>> => {
    try {
      const outcomes = await db.batch(statements.map(prepared))
      return ok(outcomes.map((outcome) => outcome.meta?.changes ?? 0))
    } catch (cause) {
      return err({ kind: 'storage_unavailable', detail: String(cause) })
    }
  }

  return { all, batch }
}
