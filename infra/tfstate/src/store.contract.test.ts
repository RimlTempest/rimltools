import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import { createD1Store } from './d1-store.ts'
import { createMemoryStore } from './memory-store.ts'
import type { D1Like, D1Row, D1Stmt, D1Value, StateStore } from './store.ts'

const MIGRATION = new URL('../migrations/0001_init.sql', import.meta.url)

// D1 の API（prepare / bind / first / all / run / batch）を bun:sqlite で模す。
// batch はトランザクションで包む（D1 の batch と同じく、全部成功か全部失敗）。
const isRow = (value: unknown): value is D1Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const fakeD1 = async (): Promise<D1Like> => {
  const db = new Database(':memory:')
  db.exec(await Bun.file(MIGRATION).text())
  const bound = new Map<D1Stmt, { sql: string; params: D1Value[] }>()
  const statement = (sql: string, params: D1Value[] = []): D1Stmt => {
    const stmt: D1Stmt = {
      bind: (...values) => statement(sql, values),
      first: async () => {
        const row: unknown = db.query(sql).get(...params)
        return isRow(row) ? row : null
      },
      all: async () => ({
        results: db
          .query(sql)
          .all(...params)
          .filter(isRow),
      }),
      run: async () => ({ meta: { changes: db.query(sql).run(...params).changes } }),
    }
    bound.set(stmt, { sql, params })
    return stmt
  }
  return {
    prepare: (sql) => statement(sql),
    batch: async (stmts) => {
      const tx = db.transaction(() =>
        stmts.map((stmt) => {
          const b = bound.get(stmt)
          if (b === undefined) return { meta: { changes: 0 } }
          return { meta: { changes: db.query(b.sql).run(...b.params).changes } }
        }),
      )
      return tx()
    },
  }
}

const stores: [string, () => Promise<StateStore>][] = [
  ['memory', async () => createMemoryStore({ keepVersions: 3 })],
  ['d1', async () => createD1Store(await fakeD1(), { chunkBytes: 8, keepVersions: 3 })],
]

describe.each(stores)('%s store', (_name, make) => {
  const P = '/states/rimltools-production'

  test('get returns null before the first write', async () => {
    const store = await make()
    expect(await store.getState(P)).toEqual({ ok: true, value: null })
  })

  test('put then get round-trips bodies larger than one chunk', async () => {
    const store = await make()
    const body = 'x'.repeat(50) + '終' + 'y'.repeat(7)
    expect((await store.putState(P, body, { serial: 1, lineage: 'l' }, 0)).ok).toBe(true)
    expect(await store.getState(P)).toEqual({ ok: true, value: body })
  })

  test('keeps only the latest versions and serves the newest', async () => {
    const store = await make()
    // 版は順に積む必要があるので、並列にせず 1 つずつつなぐ
    await [1, 2, 3, 4, 5].reduce<Promise<unknown>>(
      (previous, i) =>
        previous.then(() => store.putState(P, `body-${i}`, { serial: i, lineage: 'l' }, i)),
      Promise.resolve(),
    )
    expect(await store.getState(P)).toEqual({ ok: true, value: 'body-5' })
    const versions = await store.listVersions(P)
    expect(versions.ok).toBe(true)
    if (!versions.ok) return
    expect(versions.value.map((v) => v.serial)).toEqual([5, 4, 3])
  })

  test('delete removes the state and its versions', async () => {
    const store = await make()
    await store.putState(P, 'b', { serial: 1, lineage: 'l' }, 0)
    await store.deleteState(P)
    expect(await store.getState(P)).toEqual({ ok: true, value: null })
  })

  test('lock: acquire, conflict, expiry, release', async () => {
    const store = await make()
    expect(await store.acquireLock(P, { id: 'a', info: '{"ID":"a"}' }, 100, 10)).toEqual({
      ok: true,
      value: { acquired: true },
    })
    expect(await store.acquireLock(P, { id: 'b', info: '{"ID":"b"}' }, 100, 20)).toEqual({
      ok: true,
      value: { acquired: false, holder: { id: 'a', info: '{"ID":"a"}' } },
    })
    // 期限（expiresAt=100）を過ぎたら奪える
    expect(await store.acquireLock(P, { id: 'b', info: '{"ID":"b"}' }, 300, 150)).toEqual({
      ok: true,
      value: { acquired: true },
    })
    expect(await store.getLock(P, 160)).toEqual({
      ok: true,
      value: { id: 'b', info: '{"ID":"b"}' },
    })
    expect(await store.releaseLock(P, 'a')).toEqual({ ok: true, value: false })
    expect(await store.releaseLock(P, 'b')).toEqual({ ok: true, value: true })
    expect(await store.getLock(P, 170)).toEqual({ ok: true, value: null })
  })

  test('getLock ignores an expired lock', async () => {
    const store = await make()
    await store.acquireLock(P, { id: 'a', info: '{}' }, 100, 10)
    expect(await store.getLock(P, 101)).toEqual({ ok: true, value: null })
  })
})
