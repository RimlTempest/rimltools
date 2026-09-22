/**
 * Service Worker の install / activate / fetch のハンドラを組み立てる。
 *
 * `self`（ServiceWorkerGlobalScope）には触らず、必要なものを構造型で受け取る。
 * 実物の `caches` / `FetchEvent` はこの型を満たすので、配線（index.ts）はそのまま渡せる。
 */

import {
  cacheFirst,
  networkFirst,
  networkOnly,
  staleWhileRevalidate,
  type CacheLike,
  type StrategyFn,
} from './strategies.ts'

/** リクエストの扱い。`bypass` はブラウザに任せる（respondWith しない） */
export type Strategy =
  | 'bypass'
  | 'cache-first'
  | 'network-first'
  | 'network-only'
  | 'stale-while-revalidate'

/** 方針（decide）が判断に使う、リクエストの事実だけ */
export type RequestFacts = {
  readonly method: string
  readonly pathname: string
  /** Service Worker と同じオリジンか */
  readonly sameOrigin: boolean
  /** ページ遷移（HTML の取得）か */
  readonly navigation: boolean
  /** プロトコルの切り替え（WebSocket など）を求めているか */
  readonly upgrade: boolean
}

export type Decide = (facts: RequestFacts) => Strategy

export type CacheStorageLike = {
  readonly open: (
    name: string,
  ) => Promise<CacheLike & { readonly addAll: (urls: string[]) => Promise<void> }>
  readonly keys: () => Promise<readonly string[]>
  readonly delete: (name: string) => Promise<boolean>
}

type ExtendableEventLike = { readonly waitUntil: (promise: Promise<unknown>) => void }
type FetchEventLike = {
  readonly request: Request
  readonly respondWith: (response: Promise<Response>) => void
}

const STRATEGIES: Readonly<Record<Exclude<Strategy, 'bypass'>, StrategyFn>> = {
  'cache-first': cacheFirst,
  'network-first': networkFirst,
  'network-only': networkOnly,
  'stale-while-revalidate': staleWhileRevalidate,
}

export const toRequestFacts = (request: Request, origin: string): RequestFacts => {
  const url = new URL(request.url)
  return {
    method: request.method,
    pathname: url.pathname,
    sameOrigin: url.origin === origin,
    navigation: request.mode === 'navigate' || request.destination === 'document',
    upgrade: request.headers.has('Upgrade'),
  }
}

/**
 * install。先に持っておくファイルがあれば保存する。
 * **新しい版をその場で有効化（skipWaiting）はしない。** 開いているページの途中でアセットの
 * 世代が入れ替わると、古い HTML が新しいチャンクを要求して壊れる。次にページを開いたときに
 * 有効になればよい。
 */
export const createInstallHandler =
  (options: {
    readonly caches: CacheStorageLike
    readonly cacheName: string
    readonly precache: readonly string[]
  }) =>
  (event: ExtendableEventLike): void => {
    if (options.precache.length === 0) return
    event.waitUntil(
      options.caches.open(options.cacheName).then((cache) => cache.addAll([...options.precache])),
    )
  }

/** activate。自分の版以外のキャッシュを全部消す */
export const createActivateHandler =
  (options: { readonly caches: CacheStorageLike; readonly cacheName: string }) =>
  (event: ExtendableEventLike): void => {
    event.waitUntil(
      options.caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name !== options.cacheName)
              .map((name) => options.caches.delete(name)),
          ),
        ),
    )
  }

/** fetch。decide が選んだ戦略で応答する。`bypass` なら何もしない（ブラウザが普通に取る） */
export const createFetchHandler =
  (options: {
    readonly caches: CacheStorageLike
    readonly cacheName: string
    readonly origin: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly decide: Decide
  }) =>
  (event: FetchEventLike): void => {
    const strategy = options.decide(toRequestFacts(event.request, options.origin))
    if (strategy === 'bypass') return

    const deps = {
      openCache: () => options.caches.open(options.cacheName),
      fetch: options.fetch,
    }
    event.respondWith(STRATEGIES[strategy](deps, event.request))
  }
