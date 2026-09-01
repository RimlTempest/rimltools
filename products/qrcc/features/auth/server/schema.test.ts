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
const MIGRATIONS_DIR = join(import.meta.dir, '../../../apps/api/migrations')

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

describe('Drizzle スキーマ', () => {
  const db = migrated()

  for (const { name, table } of TABLES) {
    test(`${name} の列がマイグレーションと一致する`, () => {
      const config = getTableConfig(table)
      expect(config.name).toBe(name)
      expect(config.columns.map((column) => column.name).toSorted()).toEqual([
        ...actualColumns(db, name),
      ])
    })
  }

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
