import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D1 のマイグレーションを実物の SQLite に当てて確かめる。
 *
 * D1 は SQLite なので、同じ SQL を `bun:sqlite` のインメモリ DB に流せば
 * Worker を起動せずに文法と制約を検証できる（Small のまま実物を試せる）。
 */
const MIGRATIONS_DIR = join(import.meta.dir, '../../../apps/api/migrations')

const migrationFiles = (): readonly string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .toSorted()

const applyMigrations = (): Database => {
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const name of migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
  return db
}

const tableNames = (db: Database): readonly string[] =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name)

const columnNames = (db: Database, table: string): readonly string[] =>
  db
    .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
    .all()
    .map((row) => row.name)

const insertUser = (db: Database, id: string, email: string, isAnonymous = 0) =>
  db.run(
    'INSERT INTO "user" (id, name, email, email_verified, is_anonymous, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 0, 0)',
    [id, 'テスト', email, isAnonymous],
  )

describe('D1 マイグレーション', () => {
  test('連番のファイル名で並ぶ', () => {
    const files = migrationFiles()
    expect(files.length).toBeGreaterThan(0)
    files.forEach((name, index) => {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/)
      expect(name.slice(0, 4)).toBe(String(index + 1).padStart(4, '0'))
    })
  })

  test('ロールバックを書かない（前方移行のみ運用）', () => {
    for (const name of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
      expect(sql).not.toMatch(/DROP\s+TABLE/i)
      expect(sql).not.toMatch(/--\s*down/i)
    }
  })

  test('Better Auth が要求するテーブルを作る', () => {
    const names = tableNames(applyMigrations())
    for (const table of ['user', 'session', 'account', 'verification']) {
      expect(names).toContain(table)
    }
  })

  test('user はゲスト判定の列を持つ', () => {
    expect(columnNames(applyMigrations(), 'user')).toContain('is_anonymous')
  })

  test('メールアドレスは重複できない', () => {
    const db = applyMigrations()
    insertUser(db, 'u1', 'same@example.com')
    expect(() => insertUser(db, 'u2', 'same@example.com')).toThrow()
  })

  test('セッションはユーザーを消すと一緒に消える', () => {
    const db = applyMigrations()
    insertUser(db, 'u1', 'a@example.com')
    db.run(
      'INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)',
      ['s1', 'u1', 'token-1', 1],
    )
    db.run('DELETE FROM "user" WHERE id = ?', ['u1'])
    expect(db.query('SELECT id FROM session').all()).toHaveLength(0)
  })

  test('同じ発行者と外部アカウント ID の組は 1 つだけ', () => {
    const db = applyMigrations()
    insertUser(db, 'u1', 'a@example.com')
    const insertAccount = (id: string) =>
      db.run(
        'INSERT INTO account (id, issuer, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)',
        [id, 'https://accounts.google.com', 'google-123', 'google', 'u1'],
      )
    insertAccount('a1')
    expect(() => insertAccount('a2')).toThrow()
  })
})
