/**
 * D1 を使うための最小の入口（利用側で定義する = ISP）。
 *
 * `@cloudflare/workers-types` を feature に引き込まずに済み、テストでは
 * `bun:sqlite` を包んだ素のオブジェクトで同じ形を満たせる。実物の
 * `makeD1SqlRunner`（`@noter/auth/server`）はこの形を構造的に満たすので、
 * composition root はそのまま渡せる。
 *
 * 失敗は投げずに `Result` で返す。D1 は制約違反でも例外を投げるので、
 * 「例外を値に変える」のは runner の実装の仕事。
 */
import type { Result } from '@noter/contract'

export type SqlValue = string | number | null

export type SqlStatement = {
  readonly sql: string
  readonly params: readonly SqlValue[]
}

export type SqlRow = Record<string, unknown>

/** ストレージが答えられなかった。`PromotionIoError` と同じ形にしてある。 */
export type StorageError = {
  readonly kind: 'storage_unavailable'
  readonly detail: string
}

export type SqlRunner = {
  readonly all: (statement: SqlStatement) => Promise<Result<readonly SqlRow[], StorageError>>
  readonly run: (statement: SqlStatement) => Promise<Result<number, StorageError>>
  /**
   * 複数文を **1 トランザクション**で実行する。
   * 「途中まで成功した」状態を作らないために、単発実行の繰り返しで代用しない。
   */
  readonly batch: (
    statements: readonly SqlStatement[],
  ) => Promise<Result<readonly number[], StorageError>>
}
