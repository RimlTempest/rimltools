# @rimltools/sw

RimlTools 共通の Service Worker 部品。キャッシュ戦略と install / activate / fetch の配線だけを持ち、
**どのリクエストをどう扱うか（方針）は各プロダクトの `services/web/src/sw/policy.ts` が決める。**

| 置き場所            | 中身                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `src/strategies.ts` | `cacheFirst` / `networkFirst` / `networkOnly` / `staleWhileRevalidate`（Cache と fetch は注入） |
| `src/handlers.ts`   | install / activate / fetch のハンドラ、`RequestFacts`（方針が見るリクエストの事実）、`Strategy` |
| `src/index.ts`      | `startServiceWorker(self, config)`、`self` を型ガードで絞る `isServiceWorkerScope`              |

各プロダクトは `services/web/src/sw/sw.ts` から `startServiceWorker` を呼ぶ。`bun run sw`
（`dev` / `build` の前に自動で走る）が `scripts/build-sw.ts` で 1 ファイルの JS（IIFE）にして
`services/web/public/sw.js` に書き出す。**`public/sw.js` は生成物なのでコミットしない。**

- 新しい版をその場で有効化（skipWaiting）はしない。開いているページの途中でアセットの世代が入れ替わると壊れる
- activate で、自分の版（`cacheName`）以外のキャッシュを消す。方針を変えたら `cacheName` を上げる
- `sw.ts` は webworker の型で検査する（`services/web/tsconfig.sw.json`）。アプリ本体の tsconfig（DOM の型）には入れない
