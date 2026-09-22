import { describe, expect, test } from 'bun:test'

import {
  cacheFirst,
  networkFirst,
  networkOnly,
  staleWhileRevalidate,
  type CacheLike,
  type StrategyDeps,
} from './strategies.ts'

const req = (path: string) => new Request(`https://example.test${path}`)

/** メモリ上の Cache と、呼ばれた回数を数える fetch */
const fakes = (options: { network?: () => Promise<Response>; cached?: Record<string, string> }) => {
  const store = new Map<string, Response>(
    Object.entries(options.cached ?? {}).map(([path, body]) => [
      `https://example.test${path}`,
      new Response(body),
    ]),
  )
  const cache: CacheLike = {
    match: (request) => Promise.resolve(store.get(request.url)?.clone()),
    put: (request, response) => {
      store.set(request.url, response)
      return Promise.resolve()
    },
  }
  let fetched = 0
  const deps: StrategyDeps = {
    openCache: () => Promise.resolve(cache),
    fetch: () => {
      fetched += 1
      return options.network?.() ?? Promise.resolve(new Response('network'))
    },
  }
  return { deps, store, fetched: () => fetched }
}

const offline = () => Promise.reject(new TypeError('offline'))

describe('cacheFirst', () => {
  test('returns the cached response without touching the network', async () => {
    const f = fakes({ cached: { '/a.js': 'cached' } })
    expect(await (await cacheFirst(f.deps, req('/a.js'))).text()).toBe('cached')
    expect(f.fetched()).toBe(0)
  })

  test('fetches and stores on a miss', async () => {
    const f = fakes({})
    expect(await (await cacheFirst(f.deps, req('/a.js'))).text()).toBe('network')
    expect(f.store.has('https://example.test/a.js')).toBe(true)
  })

  test('does not store a failed response', async () => {
    const f = fakes({ network: () => Promise.resolve(new Response('no', { status: 404 })) })
    await cacheFirst(f.deps, req('/a.js'))
    expect(f.store.size).toBe(0)
  })
})

describe('networkFirst', () => {
  test('prefers the network and refreshes the cache', async () => {
    const f = fakes({ cached: { '/': 'old' } })
    expect(await (await networkFirst(f.deps, req('/'))).text()).toBe('network')
    expect(await f.store.get('https://example.test/')?.text()).toBe('network')
  })

  test('falls back to the cache when offline', async () => {
    const f = fakes({ cached: { '/': 'old' }, network: offline })
    expect(await (await networkFirst(f.deps, req('/'))).text()).toBe('old')
  })

  test('rejects when offline and nothing is cached', async () => {
    const f = fakes({ network: offline })
    const error: unknown = await networkFirst(f.deps, req('/')).then(
      () => undefined,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(TypeError)
  })
})

describe('networkOnly', () => {
  test('never reads or writes the cache', async () => {
    const f = fakes({ cached: { '/codes': 'private' } })
    expect(await (await networkOnly(f.deps, req('/codes'))).text()).toBe('network')
    expect(await f.store.get('https://example.test/codes')?.text()).toBe('private')
  })
})

describe('staleWhileRevalidate', () => {
  test('answers from the cache and refreshes it in the background', async () => {
    const f = fakes({ cached: { '/icon.svg': 'old' } })
    expect(await (await staleWhileRevalidate(f.deps, req('/icon.svg'))).text()).toBe('old')
    // 背景の更新が終わるのを待つ
    await Bun.sleep(0)
    expect(await f.store.get('https://example.test/icon.svg')?.text()).toBe('network')
  })

  test('waits for the network on a miss', async () => {
    const f = fakes({})
    expect(await (await staleWhileRevalidate(f.deps, req('/x.css'))).text()).toBe('network')
  })

  test('returns a network error when offline and nothing is cached', async () => {
    const f = fakes({ network: offline })
    expect((await staleWhileRevalidate(f.deps, req('/x.css'))).type).toBe('error')
  })
})
