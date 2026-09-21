/** ops.yml の環境変数を解釈する純関数。 */

import type { Result } from '../lib/tools.ts'
import { isRecord } from './lib/json.ts'
import type { Target } from './probe.ts'

/**
 * `OPS_HOST_OVERRIDES`（repo variable、JSON）: `{ "<tool>": "<host>" }`。
 * 新ドメインへ切り替える前は旧ホストを監視する。空文字はそのツールを監視しない。
 */
export const parseHostOverrides = (
  raw: string | undefined,
): Result<Record<string, string>, string> => {
  if (raw === undefined || raw.trim() === '') return { ok: true, value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'OPS_HOST_OVERRIDES: invalid JSON' }
  }
  if (!isRecord(parsed)) return { ok: false, error: 'OPS_HOST_OVERRIDES: expected an object' }
  const out: Record<string, string> = {}
  for (const [tool, host] of Object.entries(parsed)) {
    if (typeof host !== 'string')
      return { ok: false, error: `OPS_HOST_OVERRIDES.${tool}: expected a string` }
    out[tool] = host
  }
  return { ok: true, value: out }
}

export const resolveTargets = (tools: Target[], overrides: Record<string, string>): Target[] =>
  tools.flatMap((t) => {
    const host = overrides[t.name] ?? t.host
    return host === '' ? [] : [{ name: t.name, host }]
  })

const day = (d: Date) => d.toISOString().slice(0, 10)

/** 今日（UTC）を終端とする days 日の窓 */
export const dateRange = (now: Date, days: number): { start: string; end: string } => {
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { start: day(start), end: day(now) }
}
