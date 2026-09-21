/**
 * synthetic 監視の純粋な部分: HTML から検査対象のアセットを拾い、結果をまとめる。
 * アセットは Static Assets なので、叩いても Workers の requests を消費しない。
 */

export type Check = {
  url: string
  expected: number
  /** 応答が無ければ null（error に理由） */
  status: number | null
  error?: string
}

export type ProbeSummary = { tool: string; ok: boolean; checks: Check[]; failures: string[] }

const TAG = /<(script|link)\b[^>]*>/gi
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i')
const ASSET_RELS = new Set(['stylesheet', 'modulepreload', 'preload'])

export const extractAssets = (html: string, pageUrl: string): string[] => {
  const origin = new URL(pageUrl).origin
  const found = new Set<string>()
  for (const match of html.matchAll(TAG)) {
    const tag = match[0]
    const isScript = match[1]?.toLowerCase() === 'script'
    const ref = isScript ? ATTR('src').exec(tag)?.[1] : ATTR('href').exec(tag)?.[1]
    if (ref === undefined) continue
    if (!isScript) {
      const rel = ATTR('rel').exec(tag)?.[1]?.toLowerCase() ?? ''
      if (!rel.split(/\s+/).some((r) => ASSET_RELS.has(r))) continue
    }
    const url = new URL(ref, pageUrl)
    if (url.origin === origin) found.add(url.toString())
  }
  return [...found]
}

export const summarizeProbe = (tool: string, checks: Check[]): ProbeSummary => {
  const failures = checks
    .filter((c) => c.status !== c.expected)
    .map((c) => `${c.url}: expected ${c.expected}, got ${c.status ?? c.error ?? 'no response'}`)
  return { tool, ok: checks.length > 0 && failures.length === 0, checks, failures }
}
