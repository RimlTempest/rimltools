import { describe, expect, test } from 'bun:test'

import {
  createActivateHandler,
  createFetchHandler,
  createInstallHandler,
  toRequestFacts,
  type CacheStorageLike,
  type Strategy,
} from './handlers.ts'

const ORIGIN = 'https://tool.example.test'

const fakeCaches = (names: string[]) => {
  const deleted: string[] = []
  const added: string[][] = []
  const storage: CacheStorageLike = {
    keys: () => Promise.resolve(names),
    delete: (name) => {
      deleted.push(name)
      return Promise.resolve(true)
    },
    open: () =>
      Promise.resolve({
        match: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
        addAll: (urls) => {
          added.push([...urls])
          return Promise.resolve()
        },
      }),
  }
  return { storage, deleted, added }
}

/** waitUntil / respondWith に渡された Promise を集める偽のイベント */
const fakeEvent = (request?: Request) => {
  const waited: Promise<unknown>[] = []
  const responded: Promise<Response>[] = []
  return {
    event: {
      request: request ?? new Request(`${ORIGIN}/`),
      waitUntil: (p: Promise<unknown>) => {
        waited.push(p)
      },
      respondWith: (p: Promise<Response>) => {
        responded.push(p)
      },
    },
    waited,
    responded,
  }
}

describe('toRequestFacts', () => {
  test('extracts what a policy needs', () => {
    const facts = toRequestFacts(
      new Request(`${ORIGIN}/codes/1?x=1`, { headers: { Upgrade: 'websocket' } }),
      ORIGIN,
    )
    expect(facts).toEqual({
      method: 'GET',
      pathname: '/codes/1',
      sameOrigin: true,
      navigation: false,
      upgrade: true,
    })
  })

  test('marks other origins', () => {
    expect(toRequestFacts(new Request('https://cdn.example.test/a.js'), ORIGIN).sameOrigin).toBe(
      false,
    )
  })
})

describe('createInstallHandler', () => {
  test('precaches the listed URLs', async () => {
    const c = fakeCaches([])
    const e = fakeEvent()
    createInstallHandler({ caches: c.storage, cacheName: 'v1', precache: ['/icon.svg'] })(e.event)
    await Promise.all(e.waited)
    expect(c.added).toEqual([['/icon.svg']])
  })

  test('does nothing when there is nothing to precache (and never skips waiting)', () => {
    const c = fakeCaches([])
    const e = fakeEvent()
    createInstallHandler({ caches: c.storage, cacheName: 'v1', precache: [] })(e.event)
    expect(e.waited).toHaveLength(0)
  })
})

describe('createActivateHandler', () => {
  test('deletes every cache except the current version', async () => {
    const c = fakeCaches(['v0', 'v1', 'other'])
    const e = fakeEvent()
    createActivateHandler({ caches: c.storage, cacheName: 'v1' })(e.event)
    await Promise.all(e.waited)
    expect(c.deleted.toSorted()).toEqual(['other', 'v0'])
  })
})

describe('createFetchHandler', () => {
  const run = (strategy: Strategy) => {
    const c = fakeCaches([])
    const e = fakeEvent(new Request(`${ORIGIN}/assets/a.js`))
    const seen: string[] = []
    createFetchHandler({
      caches: c.storage,
      cacheName: 'v1',
      origin: ORIGIN,
      fetch: () => Promise.resolve(new Response('network')),
      decide: (facts) => {
        seen.push(facts.pathname)
        return strategy
      },
    })(e.event)
    return { e, seen }
  }

  test('leaves bypassed requests to the browser', () => {
    const { e, seen } = run('bypass')
    expect(seen).toEqual(['/assets/a.js'])
    expect(e.responded).toHaveLength(0)
  })

  test.each<Strategy>(['cache-first', 'network-first', 'network-only', 'stale-while-revalidate'])(
    'answers with %p',
    async (strategy) => {
      const { e } = run(strategy)
      expect(e.responded).toHaveLength(1)
      expect(await (await e.responded[0])?.text()).toBe('network')
    },
  )
})
