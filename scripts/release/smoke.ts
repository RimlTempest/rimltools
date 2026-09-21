import type { Result } from '../lib/tools.ts'

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

const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/i
const tagPattern = /<(script|link|img)\b[^>]*>/gi
const relPattern = /\srel\s*=\s*["']([^"']+)["']/i
const assetRels = new Set(['stylesheet', 'modulepreload', 'preload', 'icon', 'manifest'])

export const referencedAssets = (html: string, pageUrl: string): string[] => {
  const origin = new URL(pageUrl).origin
  const out: string[] = []
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0]
    const kind = (match[1] ?? '').toLowerCase()
    if (kind === 'link') {
      const rel = relPattern.exec(tag)?.[1]?.toLowerCase() ?? ''
      if (!rel.split(/\s+/).some((r) => assetRels.has(r))) continue
    }
    const ref = attr.exec(tag)?.[1]
    if (ref === undefined || ref.startsWith('data:')) continue
    const url = new URL(ref, pageUrl)
    if (url.origin !== origin) continue
    if (!out.includes(url.href)) out.push(url.href)
  }
  return out
}

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
