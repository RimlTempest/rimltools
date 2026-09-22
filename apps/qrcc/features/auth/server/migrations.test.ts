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
const MIGRATIONS_DIR = join(import.meta.dir, '../../../services/api/migrations')

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

const insertPromotion = (db: Database, from: string, to: string) =>
  db.run(
    'INSERT INTO account_promotion (from_user_id, to_user_id, moved_codes, moved_folders, completed_at) VALUES (?, ?, 0, 0, 0)',
    [from, to],
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
      expect(sql).not.toMatch(/--\s*down/i)
      // DROP TABLE は、先頭に `-- contract:` の注記がある前方移行（表の作り直しなど）だけに許す。
      // リリースの guard（scripts/release/migrations.ts）と同じ基準
      if (!/^--\s*contract:/i.test(sql.trimStart())) expect(sql).not.toMatch(/DROP\s+TABLE/i)
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

const insertAccountWithoutIssuer = (db: Database, id: string, accountId: string) =>
  db.run(
    'INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)',
    [id, accountId, 'google', 'u1'],
  )

describe('account の issuer 廃止（better-auth 1.7.3、0005 の expand）', () => {
  test('新しい版（issuer を書かない）で account を作れる', () => {
    const db = applyMigrations()
    insertUser(db, 'u1', 'a@example.com')
    insertAccountWithoutIssuer(db, 'a1', 'google-123')
    expect(db.query('SELECT id FROM account').all()).toHaveLength(1)
  })

  test('同じプロバイダと外部アカウント ID の組は 1 つだけ（1.6 と同じ一意性）', () => {
    const db = applyMigrations()
    insertUser(db, 'u1', 'a@example.com')
    insertAccountWithoutIssuer(db, 'a1', 'google-123')
    expect(() => insertAccountWithoutIssuer(db, 'a2', 'google-123')).toThrow()
  })

  test('0005 は既存の account を 1 行も落とさない', () => {
    const db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    const before = migrationFiles().filter((name) => name < '0005')
    const after = migrationFiles().filter((name) => name >= '0005')
    for (const name of before) db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    insertUser(db, 'u1', 'a@example.com')
    db.run(
      'INSERT INTO account (id, issuer, account_id, provider_id, user_id, access_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 2)',
      ['a1', 'https://accounts.google.com', 'google-123', 'google', 'u1', 'tok'],
    )
    for (const name of after) db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    expect(db.query('SELECT * FROM account').all()).toEqual([
      {
        id: 'a1',
        issuer: 'https://accounts.google.com',
        account_id: 'google-123',
        provider_id: 'google',
        user_id: 'u1',
        access_token: 'tok',
        refresh_token: null,
        id_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        scope: null,
        password: null,
        created_at: 1,
        updated_at: 2,
      },
    ])
    // ユーザーを消せば account も消える（外部キーを作り直しで失っていない）
    db.run('DELETE FROM "user" WHERE id = ?', ['u1'])
    expect(db.query('SELECT id FROM account').all()).toHaveLength(0)
  })
})

describe('ゲスト → Google の移譲記録', () => {
  test('同じゲストからの移譲は 1 度しか記録できない（冪等性の土台）', () => {
    const db = applyMigrations()
    insertUser(db, 'guest', 'guest@anonymous.placeholder.invalid', 1)
    insertUser(db, 'google', 'me@example.com')
    insertPromotion(db, 'guest', 'google')
    // 2 回目の INSERT が主キー制約で落ちることが、二重移譲を止める最後の砦になる
    expect(() => insertPromotion(db, 'guest', 'google')).toThrow()
  })

  test('ゲストのユーザー行が消えても移譲済みの記録は残る', () => {
    const db = applyMigrations()
    insertUser(db, 'guest', 'guest@anonymous.placeholder.invalid', 1)
    insertUser(db, 'google', 'me@example.com')
    insertPromotion(db, 'guest', 'google')
    // Better Auth は連携後にゲストのユーザー行を消す。外部キーを張ると
    // 記録まで一緒に消え、リトライで二重移譲が起きてしまう
    db.run('DELETE FROM "user" WHERE id = ?', ['guest'])
    expect(db.query('SELECT from_user_id FROM account_promotion').all()).toHaveLength(1)
  })
})
