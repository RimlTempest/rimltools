/**
 * synthetic 監視の実行器。fetch と sleep は注入する（テストで差し替える）。
 *
 * Workers のリクエスト消費: ページ本体（SSR）1 回 + extras。アセットは Static Assets
 * から配信されるので無料枠を消費しない（docs/slo.md に試算）。
 */

import { type Check, extractAssets, type ProbeSummary, summarizeProbe } from './synthetic.ts'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ExtraCheck = { path: string; expected: number }

export type Target = { name: string; host: string }

/** ツール固有の軽い確認。叩くたびに Worker を 1 回起動するので最小限にする。 */
export const EXTRA_CHECKS: Record<string, ExtraCheck[]> = {
  // WebSocket の入口は Upgrade 無しで 426 を返す（products/noter/scripts/smoke.ts の WS_PROBE_PATH と同じ）
  noter: [{ path: '/ws/doc_000000000000000000000000', expected: 426 }],
}

/** 1 ページから叩くアセット数の上限（Static Assets は無料だが、実行時間を抑える） */
const MAX_ASSETS = 20
const TIMEOUT_MS = 10_000

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const hit = async (
  fetchFn: FetchLike,
  url: string,
  expected: number,
): Promise<{ check: Check; body: string }> => {
  try {
    const res = await fetchFn(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'rimltools-synthetic/1 (+https://github.com/RimlTempest/rimltools)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body =
      res.headers.get('content-type')?.includes('text/html') === false ? '' : await res.text()
    return { check: { url, expected, status: res.status }, body }
  } catch (e) {
    return { check: { url, expected, status: null, error: errorText(e) }, body: '' }
  }
}

export const probeTool = async (
  deps: { fetch: FetchLike },
  target: Target,
  extras: ExtraCheck[],
): Promise<ProbeSummary> => {
  const pageUrl = `https://${target.host}/`
  const page = await hit(deps.fetch, pageUrl, 200)
  if (page.check.status !== 200) return summarizeProbe(target.name, [page.check])

  const assets = extractAssets(page.body, pageUrl).slice(0, MAX_ASSETS)
  const extraUrls = extras.map((x) => ({
    url: new URL(x.path, pageUrl).toString(),
    expected: x.expected,
  }))
  const rest = await Promise.all(
    [...assets.map((url) => ({ url, expected: 200 })), ...extraUrls].map(async (c) => {
      const r = await hit(deps.fetch, c.url, c.expected)
      return r.check
    }),
  )
  return summarizeProbe(target.name, [page.check, ...rest])
}

export type RetryResult = { failing: boolean; first: ProbeSummary; last: ProbeSummary }

/** 失敗したら delay 後にもう 1 回。2 回続けて失敗したときだけ failing（瞬断で起票しない）。 */
export const probeWithRetry = async (
  deps: { fetch: FetchLike; sleep: (ms: number) => Promise<void> },
  target: Target,
  extras: ExtraCheck[],
  delayMs: number,
): Promise<RetryResult> => {
  const first = await probeTool(deps, target, extras)
  if (first.ok) return { failing: false, first, last: first }
  await deps.sleep(delayMs)
  const last = await probeTool(deps, target, extras)
  return { failing: !last.ok, first, last }
}
