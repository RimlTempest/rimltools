import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { account, session, user, verification } from './schema.ts'

/**
 * Drizzle スキーマと D1 マイグレーションがずれていないことを確かめる。
 *
 * 片方だけ直すと、型は通るのに実行時だけ壊れる。実物の SQLite に
 * マイグレーションを当て、列名を突き合わせて機械的に検出する。
 */
const MIGRATIONS_DIR = join(import.meta.dir, '../../../services/web/migrations')

const migrated = (): Database => {
  const db = new Database(':memory:')
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
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
  { name: 'session', table: session },
  { name: 'account', table: account },
  { name: 'verification', table: verification },
] as const

describe('Drizzle スキーマ', () => {
  const db = migrated()

  test('マイグレーションが SQLite に当たる', () => {
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    expect(tables).toContain('user')
    expect(tables).toContain('session')
    expect(tables).toContain('account')
    expect(tables).toContain('verification')
  })

  for (const { name, table } of TABLES) {
    test(`${name} の列がマイグレーションと一致する`, () => {
      const config = getTableConfig(table)
      expect(config.name).toBe(name)
      expect(config.columns.map((column) => column.name).toSorted()).toEqual([
        ...actualColumns(db, name),
      ])
    })
  }

  test('user は promoted_from を持ち、Drizzle スキーマには出さない（ADR-0010）', () => {
    const columns = actualColumns(db, 'user')
    expect(columns).toContain('promoted_from')
    // Better Auth の管理外。ブラウザに配らないため Drizzle アダプタには渡さない
    const drizzleColumns = getTableConfig(user).columns.map((column) => column.name)
    expect(drizzleColumns).not.toContain('promoted_from')
    expect(drizzleColumns.toSorted()).toEqual(
      columns.filter((column) => column !== 'promoted_from').toSorted(),
    )
  })

  test('1 人のゲストを 2 つのアカウントが取り合えない', () => {
    const insert = (id: string, promotedFrom: string | null) =>
      db.run(
        'INSERT INTO "user" (id, name, email, created_at, updated_at, promoted_from) VALUES (?, ?, ?, 0, 0, ?)',
        [id, id, `${id}@guest.noter.invalid`, promotedFrom],
      )
    insert('usr_guest', null)
    insert('usr_a', 'usr_guest')
    expect(() => insert('usr_b', 'usr_guest')).toThrow()
    // 未昇格（NULL）は何行あってもよい
    insert('usr_c', null)
    insert('usr_d', null)
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
