import { ASSET_SCOPES, extractAssets as extractHtmlAssets } from '../lib/html-assets.ts'

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

/** 表示に要るスクリプトとスタイル（範囲は scripts/lib/html-assets.ts の synthetic） */
export const extractAssets = (html: string, pageUrl: string): string[] =>
  extractHtmlAssets(html, pageUrl, ASSET_SCOPES.synthetic)

export const summarizeProbe = (tool: string, checks: Check[]): ProbeSummary => {
  const failures = checks
    .filter((c) => c.status !== c.expected)
    .map((c) => `${c.url}: expected ${c.expected}, got ${c.status ?? c.error ?? 'no response'}`)
  return { tool, ok: checks.length > 0 && failures.length === 0, checks, failures }
}
