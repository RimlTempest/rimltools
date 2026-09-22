/**
 * RimlTools 共通の Service Worker 部品。
 *
 * 各プロダクトの `src/sw/sw.ts` が、キャッシュ名・先に持っておくファイル・方針（decide）を
 * 渡して `startServiceWorker` を呼ぶ。ビルドは `scripts/build-sw.ts` が 1 ファイルの
 * JS（`public/sw.js`）にする。
 */

import {
  createActivateHandler,
  createFetchHandler,
  createInstallHandler,
  type Decide,
} from './handlers.ts'

export type { Decide, RequestFacts, Strategy } from './handlers.ts'
export { toRequestFacts } from './handlers.ts'

export type ServiceWorkerConfig = {
  /** キャッシュの版。方針を変えたら上げる（activate で古い版が消える） */
  readonly cacheName: string
  /** install 時に持っておくファイル（HTML は入れない） */
  readonly precache: readonly string[]
  readonly decide: Decide
}

/**
 * `self` が Service Worker のスコープかを確かめる。
 * webworker の型では `self` は WorkerGlobalScope なので、型ガードで絞ってから使う。
 */
export const isServiceWorkerScope = (scope: unknown): scope is ServiceWorkerGlobalScope =>
  typeof scope === 'object' && scope !== null && 'registration' in scope && 'skipWaiting' in scope

export const startServiceWorker = (
  scope: ServiceWorkerGlobalScope,
  config: ServiceWorkerConfig,
): void => {
  const { cacheName } = config
  scope.addEventListener(
    'install',
    createInstallHandler({ caches: scope.caches, cacheName, precache: config.precache }),
  )
  scope.addEventListener('activate', createActivateHandler({ caches: scope.caches, cacheName }))
  scope.addEventListener(
    'fetch',
    createFetchHandler({
      caches: scope.caches,
      cacheName,
      origin: scope.location.origin,
      fetch: (request) => scope.fetch(request),
      decide: config.decide,
    }),
  )
}
