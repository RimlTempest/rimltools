import type { Result } from '../lib/tools.ts'
import { ASSET_SCOPES, extractAssets } from '../lib/html-assets.ts'

/**
 * 汎用 smoke: HTML が 200 で返り、参照している同一オリジンのアセットが全数 200。
 * override ヘッダ付きで「まだ誰にも配っていない版」を本番ドメインで叩くのに使う
 * （プロダクトの smoke-cli はヘッダを渡せないため）。
 */
export type SmokeResponse = { status: number; text: () => Promise<string> }
export type SmokeFetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<SmokeResponse>

export const overrideHeader = (worker: string, versionId: string): Record<string, string> => ({
  'Cloudflare-Workers-Version-Overrides': `${worker}="${versionId}"`,
})

/** 新しい版が参照している同一オリジンの資産（範囲は scripts/lib/html-assets.ts の release） */
export const referencedAssets = (html: string, pageUrl: string): string[] =>
  extractAssets(html, pageUrl, ASSET_SCOPES.release)

export const runSmoke = async (
  pageUrl: string,
  headers: Record<string, string>,
  fetcher: SmokeFetch,
): Promise<Result<{ assets: number }, string>> => {
  const page = await fetcher(pageUrl, { headers })
  if (page.status !== 200) return { ok: false, error: `${page.status} ${pageUrl}` }
  const assets = referencedAssets(await page.text(), pageUrl)
  const responses = await Promise.all(
    assets.map(async (url) => ({ url, res: await fetcher(url, { headers }) })),
  )
  const broken = responses
    .filter(({ res }) => res.status !== 200)
    .map(({ url, res }) => `${res.status} ${url}`)
  if (broken.length > 0) return { ok: false, error: `broken assets:\n${broken.join('\n')}` }
  return { ok: true, value: { assets: assets.length } }
}
