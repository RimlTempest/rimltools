import { describe, expect, test } from 'bun:test'

import { createD1FlagStore } from './store.ts'
import type { CacheLike, D1Like } from './store.ts'

const def = (key: string, enabled = true) =>
  JSON.stringify({
    key,
    description: 'd',
    type: 'boolean',
    enabled,
    variants: { on: true, off: false },
    defaultVariant: 'off',
  })

const fakeDb = (rows: { key: string; definition: string }[], fail = false) => {
  const calls: string[] = []
  const db: D1Like = {
    prepare: (sql) => ({
      all: async () => {
        calls.push(sql)
        if (fail) return Promise.reject(new Error('D1_ERROR: boom'))
        return { results: rows }
      },
    }),
  }
  return { db, calls }
}

const urlOf = (req: Request | string) => (typeof req === 'string' ? req : req.url)

const fakeCache = () => {
  const store = new Map<string, { body: string; cacheControl: string | null }>()
  const cache: CacheLike = {
    match: async (req) => {
      const hit = store.get(urlOf(req))
      return hit === undefined ? undefined : new Response(hit.body)
    },
    put: async (req, res) => {
      store.set(urlOf(req), {
        body: await res.text(),
        cacheControl: res.headers.get('cache-control'),
      })
    },
  }
  return { cache, store }
}

describe('createD1FlagStore', () => {
  test('reads all flags from D1 once and caches them', async () => {
    const { db, calls } = fakeDb([{ key: 'a', definition: def('a') }])
    const { cache, store } = fakeCache()
    const flags = createD1FlagStore({ db, cache, tool: 'qrcc', ttlSeconds: 60, log: () => {} })

    const first = await flags.load()
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.get('a')?.enabled).toBe(true)
    expect(calls).toHaveLength(1)
    expect([...store.values()][0]?.cacheControl).toBe('max-age=60')

    const second = await flags.load()
    expect(second.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  test('skips invalid rows and reports them instead of failing everything', async () => {
    const logged: unknown[] = []
    const { db } = fakeDb([
      { key: 'a', definition: def('a') },
      { key: 'b', definition: '{"key":"b"}' },
      { key: 'c', definition: 'not json' },
    ])
    const flags = createD1FlagStore({
      db,
      cache: fakeCache().cache,
      tool: 'qrcc',
      ttlSeconds: 60,
      log: (e) => logged.push(e),
    })
    const result = await flags.load()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect([...result.value.keys()]).toEqual(['a'])
    expect(logged).toHaveLength(2)
  })

  test('returns an error result when D1 fails', async () => {
    const { db } = fakeDb([], true)
    const flags = createD1FlagStore({
      db,
      cache: fakeCache().cache,
      tool: 'qrcc',
      ttlSeconds: 60,
      log: () => {},
    })
    const result = await flags.load()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('D1_ERROR')
  })

  test('works without a cache (local dev / tests)', async () => {
    const { db, calls } = fakeDb([{ key: 'a', definition: def('a') }])
    const flags = createD1FlagStore({ db, tool: 'qrcc', ttlSeconds: 60, log: () => {} })
    await flags.load()
    await flags.load()
    expect(calls).toHaveLength(2)
  })
})
