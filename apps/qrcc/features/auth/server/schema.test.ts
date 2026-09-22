import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { account, accountPromotion, session, user, verification } from './schema.ts'

/**
 * Drizzle スキーマと D1 マイグレーションがずれていないことを確かめる。
 *
 * 片方だけ直すと、型は通るのに実行時だけ壊れる。実物の SQLite に
 * マイグレーションを当て、列名を突き合わせて機械的に検出する。
 */
const MIGRATIONS_DIR = join(import.meta.dir, '../../../services/api/migrations')

const migrated = (): Database => {
  const db = new Database(':memory:')
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
  return db
}

const actualColumns = (db: Database, table: string): readonly string[] =>
  db
    .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
    .all()
    .map((row) => row.name)
    .toSorted()

const TABLES = [
  { name: 'user', table: user },
  { name: 'session', table: session },
  { name: 'account', table: account },
  { name: 'verification', table: verification },
  { name: 'account_promotion', table: accountPromotion },
] as const

/**
 * D1 には残っているが、Better Auth がもう読み書きしない列（contract の migration 待ち）。
 *
 * better-auth 1.7.3 で `account.issuer` が廃止された。カナリア中は 1.7.2 の旧版も同じ D1 を
 * 使うので、列は 0005 で NULL 可にしただけで残し、全版が 1.7.5 以降になってから消す
 * （docs/release.md の expand → contract）。Drizzle スキーマには書かない — 書くと 1.7.3 以降の
 * 起動時スキーマ検証が「Better Auth が書かない列」として認証を拒否する。
 */
const PENDING_CONTRACT: Readonly<Record<string, readonly string[]>> = {
  account: ['issuer'],
}

const nullable = (db: Database, table: string, column: string): boolean =>
  db
    .query<{ name: string; notnull: number }, []>(`PRAGMA table_info("${table}")`)
    .all()
    .some((row) => row.name === column && row.notnull === 0)

describe('Drizzle スキーマ', () => {
  const db = migrated()

  for (const { name, table } of TABLES) {
    test(`${name} の列がマイグレーションと一致する（contract 待ちの列を除く）`, () => {
      const config = getTableConfig(table)
      expect(config.name).toBe(name)
      const pending = PENDING_CONTRACT[name] ?? []
      expect([...config.columns.map((column) => column.name), ...pending].toSorted()).toEqual([
        ...actualColumns(db, name),
      ])
    })
  }

  test('contract 待ちの列はすべて NULL 可（新しい版が書かなくても INSERT が通る）', () => {
    for (const [table, columns] of Object.entries(PENDING_CONTRACT)) {
      for (const column of columns) expect(nullable(db, table, column)).toBe(true)
    }
  })

  test('Better Auth のフィールド名（camelCase）で引ける', () => {
    // Drizzle アダプタは schema[model][field] で列を引く。
    // プロパティ名が Better Auth のフィールド名と一致していないと実行時に落ちる
    expect(user.emailVerified.name).toBe('email_verified')
    expect(user.isAnonymous.name).toBe('is_anonymous')
    expect(session.expiresAt.name).toBe('expires_at')
    expect(account.accountId.name).toBe('account_id')
    expect(account.providerId.name).toBe('provider_id')
  })
})
