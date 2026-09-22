import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { SqlRow, SqlRunner, SqlStatement, SqlValue } from './sql.ts'
import { makePromotionStore } from './promotion-store.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')
const OTHER = asUserId('usr_2222222222222222222222zz')

const MIGRATION = join(import.meta.dir, '../../../services/web/migrations/0001_auth.sql')

/**
 * 本物の SQLite に本物のマイグレーションを当てて動かす（Medium テスト）。
 * ユニーク制約の挙動そのものが仕様なので、フェイクでは意味がない。
 */
const sqliteRunner = (): { runner: SqlRunner; db: Database } => {
  const db = new Database(':memory:')
  db.exec(readFileSync(MIGRATION, 'utf8'))
  const runner: SqlRunner = {
    all: async ({ sql, params }: SqlStatement) => {
      try {
        return { ok: true, value: db.query<SqlRow, SqlValue[]>(sql).all(...params) }
      } catch (cause) {
        return { ok: false, error: { kind: 'storage_unavailable', detail: String(cause) } }
      }
    },
    run: async ({ sql, params }: SqlStatement) => {
      try {
        return { ok: true, value: db.run(sql, [...params]).changes }
      } catch (cause) {
        return { ok: false, error: { kind: 'storage_unavailable', detail: String(cause) } }
      }
    },
    batch: async () => ({ ok: false, error: { kind: 'storage_unavailable', detail: '未使用' } }),
  }
  return { runner, db }
}

const addUser = (db: Database, id: string) =>
  db.run('INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 0, 0)', [
    id,
    id,
    `${id}@guest.noter.invalid`,
  ])

describe('promoted_from の読み書き', () => {
  test('まだ昇格していなければ記録は無い', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    const store = makePromotionStore(runner)

    expect(await store.findPromotion(GUEST)).toEqual({ ok: true, value: undefined })
  })

  test('記録すると読み出せる', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    addUser(db, GOOGLE)
    const store = makePromotionStore(runner)

    expect(await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })).toEqual({
      ok: true,
      value: { kind: 'marked' },
    })
    expect(await store.findPromotion(GUEST)).toEqual({
      ok: true,
      value: { fromUserId: GUEST, toUserId: GOOGLE },
    })
  })

  test('同じ組み合わせを 2 度記録しても既記録として返る（冪等）', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    addUser(db, GOOGLE)
    const store = makePromotionStore(runner)

    await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })
    expect(await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })).toEqual({
      ok: true,
      value: { kind: 'already_recorded', record: { fromUserId: GUEST, toUserId: GOOGLE } },
    })
  })

  test('別のアカウントが同じゲストを取ろうとしたら既記録として返す（横取り検出）', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    addUser(db, GOOGLE)
    addUser(db, OTHER)
    const store = makePromotionStore(runner)

    await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })
    // ユニーク制約に弾かれる。例外文字列ではなく現状を読み直して判断する
    expect(await store.markPromoted({ fromUserId: GUEST, toUserId: OTHER })).toEqual({
      ok: true,
      value: { kind: 'already_recorded', record: { fromUserId: GUEST, toUserId: GOOGLE } },
    })
  })

  test('昇格先が既に別のゲストから昇格済みなら、その記録を返す', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    addUser(db, OTHER)
    addUser(db, GOOGLE)
    const store = makePromotionStore(runner)

    await store.markPromoted({ fromUserId: OTHER, toUserId: GOOGLE })
    expect(await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })).toEqual({
      ok: true,
      value: { kind: 'already_recorded', record: { fromUserId: OTHER, toUserId: GOOGLE } },
    })
  })

  test('昇格先の行が無ければ失敗として返す', async () => {
    const { runner, db } = sqliteRunner()
    addUser(db, GUEST)
    const store = makePromotionStore(runner)

    const result = await store.markPromoted({ fromUserId: GUEST, toUserId: GOOGLE })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('storage_unavailable')
  })

  test('読み出しが失敗したら値で返す（投げない）', async () => {
    const store = makePromotionStore({
      all: async () => ({ ok: false, error: { kind: 'storage_unavailable', detail: 'D1 down' } }),
      run: async () => ({ ok: true, value: 0 }),
      batch: async () => ({ ok: true, value: [] }),
    })

    expect(await store.findPromotion(GUEST)).toEqual({
      ok: false,
      error: { kind: 'storage_unavailable', detail: 'D1 down' },
    })
  })
})
