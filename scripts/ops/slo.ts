/**
 * SLO とエラーバジェットの計算（ADR-0007、docs/slo.md）。
 * SLI は Workers の invocation: `errors / requests` を失敗率とみなす。
 */

export type Traffic = { requests: number; errors: number }

export type BudgetState = 'healthy' | 'burning' | 'exhausted' | 'no-traffic'

export type BudgetStatus = {
  /** SLO 目標（%） */
  target: number
  /** 実績の可用性（%）。トラフィックが無ければ null */
  availability: number | null
  /** 窓の中で許される失敗数 */
  allowedErrors: number
  errors: number
  /** 消費率（1 で使い切り。超過もそのまま出す） */
  consumed: number
  /** 残量（0..1） */
  remaining: number
  state: BudgetState
}

/** バジェットの半分を使ったら burning（リリースを慎重にする合図） */
const BURNING_AT = 0.5

export const errorBudget = (target: number, traffic: Traffic): BudgetStatus => {
  const { requests, errors } = traffic
  const allowedErrors = (requests * (100 - target)) / 100
  if (requests <= 0) {
    return {
      target,
      availability: null,
      allowedErrors: 0,
      errors,
      consumed: 0,
      remaining: 1,
      state: 'no-traffic',
    }
  }
  const availability = ((requests - errors) / requests) * 100
  const consumed =
    allowedErrors > 0 ? errors / allowedErrors : errors > 0 ? Number.POSITIVE_INFINITY : 0
  const state: BudgetState =
    consumed >= 1 ? 'exhausted' : consumed >= BURNING_AT ? 'burning' : 'healthy'
  return {
    target,
    availability,
    allowedErrors,
    errors,
    consumed,
    remaining: Math.max(0, 1 - consumed),
    state,
  }
}
