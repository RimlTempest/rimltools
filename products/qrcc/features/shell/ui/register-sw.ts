/**
 * Service Worker の登録配線。
 *
 * **`navigator` に直接触らない。** 引数で受け取る（テストで偽物を渡せる）。
 * `features/scan/ui/browser-scan.ts` と同じ方針。
 *
 * SSR とハイドレーション前は `navigator` が無いので、呼び出し側
 * （`root.route.tsx`）がハイドレーション後の `useEffect` からだけ呼ぶ。
 */

/** `ServiceWorkerContainer` のうち、この feature が使う部分だけの構造型。 */
export type ServiceWorkerContainerLike = {
  readonly register: (scriptURL: string) => Promise<unknown>
}

/**
 * Service Worker を登録する。対応していない環境（`container` が `undefined`）
 * では何もしない。登録に失敗しても例外を投げない
 * （Service Worker が無くてもアプリ本体は動くべきなので）。
 */
export const registerServiceWorker = (container: ServiceWorkerContainerLike | undefined): void => {
  if (container === undefined) return

  void container.register('/sw.js').catch(() => {
    // 登録の失敗（未対応ブラウザ・スコープ違反など）はアプリの動作を妨げない
  })
}
