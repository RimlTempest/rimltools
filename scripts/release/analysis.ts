import type { Result } from '../lib/tools.ts'

export type Stats = { requests: number; errors: number }

export type Verdict =
  | { kind: 'pass'; newRate: number; limit: number }
  | { kind: 'fail'; newRate: number; limit: number }
  | { kind: 'insufficient'; requests: number; needed: number }

const rate = (s: Stats) => (s.requests === 0 ? 0 : s.errors / s.requests)

/**
 * canary の判定（ADR-0003）。
 * 新版のエラー率が max(旧版 + 1pt, 2%) を超えたら不合格。
 * サンプルが足りなければ判定しない（呼び出し側が synthetic で補うか bake を延ばす）。
 * ただし半数以上が失敗しているなら、サンプル数に関係なく即不合格にする。
 */
export const judgeCanary = (
  candidate: Stats,
  baseline: Stats,
  opts: { minSamples: number },
): Verdict => {
  const newRate = rate(candidate)
  const limit = Math.max(rate(baseline) + 0.01, 0.02)
  if (candidate.requests >= 10 && newRate >= 0.5) return { kind: 'fail', newRate, limit }
  if (candidate.requests < opts.minSamples) {
    return { kind: 'insufficient', requests: candidate.requests, needed: opts.minSamples }
  }
  return newRate > limit ? { kind: 'fail', newRate, limit } : { kind: 'pass', newRate, limit }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const at = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined)

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : undefined)

export const parseInvocations = (body: unknown): Result<Map<string, Stats>, string> => {
  const errors = at(body, 'errors')
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map((e) => {
      const message = at(e, 'message')
      return typeof message === 'string' ? message : 'unknown error'
    })
    return { ok: false, error: `GraphQL: ${messages.join('; ')}` }
  }
  const rows = at(
    first(at(at(at(body, 'data'), 'viewer'), 'accounts')),
    'workersInvocationsAdaptive',
  )
  if (!Array.isArray(rows)) return { ok: false, error: 'GraphQL: unexpected response shape' }

  const out = new Map<string, Stats>()
  for (const row of rows) {
    const version = at(at(row, 'dimensions'), 'scriptVersion')
    const requests = at(at(row, 'sum'), 'requests')
    const errorCount = at(at(row, 'sum'), 'errors')
    if (
      typeof version !== 'string'
      || typeof requests !== 'number'
      || typeof errorCount !== 'number'
    ) {
      continue
    }
    const prev = out.get(version) ?? { requests: 0, errors: 0 }
    out.set(version, { requests: prev.requests + requests, errors: prev.errors + errorCount })
  }
  return { ok: true, value: out }
}
