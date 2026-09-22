/**
 * Medium テスト用の `SqlRunner`。`bun:sqlite` に**実際のマイグレーション**を
 * 当てるので、SQL の書き間違いも列名のずれもここで落ちる。
 *
 * D1 は SQLite なので方言の差でテストが嘘になることはほぼない。
 * 差が出るのはトランザクションの粒度だけ（D1 の `batch` は 1 トランザクション）。
 */
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { err, ok } from '@noter/contract'
import type { Err } from '@noter/contract'
import type { SqlRow, SqlRunner, SqlStatement, SqlValue, StorageError } from '../sql.ts'

const MIGRATIONS = ['0001_auth.sql', '0002_documents.sql']

const migrationSql = (name: string): string =>
  readFileSync(new URL(`../../../../apps/web/migrations/${name}`, import.meta.url), 'utf8')

export const openTestDatabase = (): Database => {
  const database = new Database(':memory:')
  // D1 は外部キーを強制する。手元だけ緩いと、参照の壊れた行を作れてしまう
  database.exec('PRAGMA foreign_keys = ON')
  for (const name of MIGRATIONS) database.exec(migrationSql(name))
  return database
}

const isRow = (value: unknown): value is SqlRow => typeof value === 'object' && value !== null

const failure = (cause: unknown): Err<StorageError> =>
  err({ kind: 'storage_unavailable', detail: String(cause) })

const bindings = (statement: SqlStatement): SqlValue[] => [...statement.params]

export const makeSqliteRunner = (database: Database): SqlRunner => {
  const changesOf = (statement: SqlStatement): number =>
    database.query(statement.sql).run(...bindings(statement)).changes

  const all = async (statement: SqlStatement) => {
    try {
      return ok(
        database
          .query(statement.sql)
          .all(...bindings(statement))
          .filter(isRow),
      )
    } catch (cause) {
      return failure(cause)
    }
  }

  const run = async (statement: SqlStatement) => {
    try {
      return ok(changesOf(statement))
    } catch (cause) {
      return failure(cause)
    }
  }

  const batch = async (statements: readonly SqlStatement[]) => {
    try {
      const inTransaction = database.transaction((list: readonly SqlStatement[]): number[] =>
        list.map(changesOf),
      )
      return ok(inTransaction(statements))
    } catch (cause) {
      return failure(cause)
    }
  }

  return { all, run, batch }
}

/** テストの前提として user 行が要る（`document.owner_id` は user を参照する）。 */
export const insertUser = (database: Database, id: string, name: string): void => {
  database
    .query(
      'INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)',
    )
    .run(id, name, `${id}@guest.noter.invalid`)
}
