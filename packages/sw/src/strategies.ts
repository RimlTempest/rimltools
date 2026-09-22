/**
 * Service Worker のキャッシュ戦略。
 *
 * Cache と fetch は引数で受け取る（`caches` / `fetch` のグローバルに直接触らない）。
 * テストではメモリ上の偽物を渡す。どのリクエストにどの戦略を使うかは、ここでは
 * 決めない（各プロダクトの `decide`）。
 */

/** Cache API のうち、戦略が使う部分だけの構造型 */
export type CacheLike = {
  readonly match: (request: Request) => Promise<Response | undefined>
  readonly put: (request: Request, response: Response) => Promise<void>
}

export type StrategyDeps = {
  /** そのプロダクトの版のキャッシュを開く */
  readonly openCache: () => Promise<CacheLike>
  readonly fetch: (request: Request) => Promise<Response>
}

export type StrategyFn = (deps: StrategyDeps, request: Request) => Promise<Response>

/**
 * キャッシュにあればそれを返し、無ければ取得して保存する。
 * 内容ハッシュ付きのファイル名（`/assets/*`）向け。中身が変わればファイル名も変わる。
 */
export const cacheFirst: StrategyFn = async (deps, request) => {
  const cache = await deps.openCache()
  const cached = await cache.match(request)
  if (cached !== undefined) return cached

  const response = await deps.fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

/**
 * ネットワークを優先し、成功した応答で保存を更新する。オフラインのときだけ保存を返す。
 * 保存も無ければネットワークの失敗をそのまま返す（ページ側はネットワークエラーになる）。
 */
export const networkFirst: StrategyFn = async (deps, request) => {
  const cache = await deps.openCache()
  try {
    const response = await deps.fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached !== undefined) return cached
    throw error
  }
}

/**
 * ネットワークだけ。オフライン時にキャッシュへ落ちることすらしない。
 * 利用者ごとに中身が違うページ用（共有端末で次の人に前の人のデータを見せない）。
 */
export const networkOnly: StrategyFn = (deps, request) => deps.fetch(request)

/**
 * 保存があればすぐに返し、裏でネットワークから取り直して保存を更新する。
 * 保存が無ければ取得を待つ。オフラインで保存も無ければネットワークエラーを返す。
 */
export const staleWhileRevalidate: StrategyFn = async (deps, request) => {
  const cache = await deps.openCache()
  const cached = await cache.match(request)

  const update = deps
    .fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached !== undefined) return cached

  const fresh = await update
  return fresh ?? Response.error()
}
