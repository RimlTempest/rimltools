/// <reference lib="webworker" />
/**
 * Service Worker のエントリ。`scripts/build-sw.ts` が 1 ファイルの JS にして
 * `public/sw.js` に書き出す（`bun run sw`。dev / build の前に自動で走る）。
 * 方針は ./policy.ts、キャッシュ戦略と配線は @rimltools/sw。
 */

import { isServiceWorkerScope, startServiceWorker } from '@rimltools/sw'

import { CACHE_NAME, decide, PRECACHE } from './policy.ts'

if (isServiceWorkerScope(self)) {
  startServiceWorker(self, { cacheName: CACHE_NAME, precache: PRECACHE, decide })
}
