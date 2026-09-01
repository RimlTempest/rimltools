import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { UserId } from '@qrcc/contract'
import { ok, parseUserId } from '@qrcc/contract'
import type { SqlRow, SqlRunner, SqlStatement, SqlValue } from './sql.ts'
import { makePromotionStore } from './promotion-store.ts'

const MIGRATIONS_DIR = join(import.meta.dir, '../../../apps/api/migrations')

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')
const AT = new Date('2026-09-01T12:00:00Z')

/** 実物の SQLite を D1 の代わりに使う。D1 も SQLite なので SQL はそのまま通る。 */
const sqliteRunner = (db: Database): SqlRunner => ({
  all: async (statement) =>
    ok(db.query<SqlRow, SqlValue[]>(statement.sql).all(...statement.params)),
  batch: async (statements) => {
    const run = db.transaction((batch: readonly SqlStatement[]) =>
      batch.map((statement) => db.run(statement.sql, [...statement.params]).changes),
    )
    return ok(run(statements))
  },
})

/**
 * `code` / `folder` は feat/manage が作るテーブル。
 * ここでは移譲対象として最小限の形だけを用意する。
 */
const withOwnedTables = (db: Database, owner: UserId, codes: number, folders: number) => {
  db.exec('CREATE TABLE code (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)')
  db.exec('CREATE TABLE folder (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)')
  for (let index = 0; index < codes; index += 1) {
    db.run('INSERT INTO code (id, owner_id) VALUES (?, ?)', [`cd_${index}`, owner])
  }
  for (let index = 0; index < folders; index += 1) {
    db.run('INSERT INTO folder (id, owner_id) VALUES (?, ?)', [`fld_${index}`, owner])
  }
}

const migrated = (): Database => {
  const db = new Database(':memory:')
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  }
  return db
}

const ownerOf = (db: Database, table: string): readonly string[] =>
  db
    .query<{ owner_id: string }, []>(`SELECT owner_id FROM ${table}`)
    .all()
    .map((row) => row.owner_id)

describe('移譲の永続化（D1）', () => {
  test('まだ移譲していなければ記録はない', async () => {
    const store = makePromotionStore(sqliteRunner(migrated()))
    const found = await store.findPromotion(GUEST)
    expect(found).toEqual({ ok: true, value: undefined })
  })

  test('所有権の付け替えと記録が 1 度で済む', async () => {
    const db = migrated()
    withOwnedTables(db, GUEST, 3, 1)
    const store = makePromotionStore(sqliteRunner(db))

    const result = await store.transferOwnership({ fromUserId: GUEST, toUserId: GOOGLE, at: AT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'transferred', movedCodes: 3, movedFolders: 1 })
    }
    expect(ownerOf(db, 'code')).toEqual([GOOGLE, GOOGLE, GOOGLE])
    expect(ownerOf(db, 'folder')).toEqual([GOOGLE])
  })

  test('もう一度実行してもデータは動かず、記録も増えない（冪等）', async () => {
    const db = migrated()
    withOwnedTables(db, GUEST, 2, 0)
    const store = makePromotionStore(sqliteRunner(db))

    await store.transferOwnership({ fromUserId: GUEST, toUserId: GOOGLE, at: AT })
    const again = await store.transferOwnership({
      fromUserId: GUEST,
      toUserId: GOOGLE,
      at: new Date('2026-09-02T00:00:00Z'),
    })

    expect(again.ok).toBe(true)
    if (again.ok) {
      expect(again.value.kind).toBe('already_recorded')
      if (again.value.kind === 'already_recorded') {
        expect(again.value.record.movedCodes).toBe(2)
        expect(again.value.record.completedAt).toEqual(AT)
      }
    }
    expect(db.query('SELECT from_user_id FROM account_promotion').all()).toHaveLength(1)
  })

  test('移譲したデータは読み出せる形で記録される', async () => {
    const db = migrated()
    withOwnedTables(db, GUEST, 1, 2)
    const store = makePromotionStore(sqliteRunner(db))
    await store.transferOwnership({ fromUserId: GUEST, toUserId: GOOGLE, at: AT })

    const found = await store.findPromotion(GUEST)

    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.value).toEqual({
        fromUserId: GUEST,
        toUserId: GOOGLE,
        movedCodes: 1,
        movedFolders: 2,
        completedAt: AT,
      })
    }
  })

  test('code / folder テーブルがまだ無くても移譲は成立する', async () => {
    // 保存機能（feat/manage）より先にログインを出せるようにする
    const store = makePromotionStore(sqliteRunner(migrated()))

    const result = await store.transferOwnership({ fromUserId: GUEST, toUserId: GOOGLE, at: AT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'transferred', movedCodes: 0, movedFolders: 0 })
    }
  })

  test('記録が壊れていたら失敗として返す（黙って別人のデータを渡さない）', async () => {
    const db = migrated()
    db.run(
      'INSERT INTO account_promotion (from_user_id, to_user_id, moved_codes, moved_folders, completed_at) VALUES (?, ?, 0, 0, 0)',
      [GUEST, 'not-a-user-id'],
    )
    const store = makePromotionStore(sqliteRunner(db))

    const found = await store.findPromotion(GUEST)

    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.error.kind).toBe('storage_unavailable')
  })

  test('SQL が失敗したら理由を添えて返す（例外を漏らさない）', async () => {
    const store = makePromotionStore({
      all: async () => ({ ok: false, error: { kind: 'storage_unavailable', detail: 'D1 down' } }),
      batch: async () => ({ ok: false, error: { kind: 'storage_unavailable', detail: 'D1 down' } }),
    })

    const found = await store.findPromotion(GUEST)
    const moved = await store.transferOwnership({ fromUserId: GUEST, toUserId: GOOGLE, at: AT })

    expect(found.ok).toBe(false)
    expect(moved.ok).toBe(false)
  })
})
