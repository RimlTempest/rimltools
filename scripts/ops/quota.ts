/**
 * Workers Free の日次上限に対する消費率（上限はアカウント全体で共有、00:00 UTC にリセット）。
 * https://developers.cloudflare.com/workers/platform/pricing/
 */

export type Usage = { workersRequests: number; d1RowsWritten: number; d1RowsRead: number }

export type QuotaKey = keyof Usage

export const FREE_LIMITS: Usage = {
  workersRequests: 100_000,
  d1RowsWritten: 100_000,
  d1RowsRead: 5_000_000,
}

export const QUOTA_LABELS: Record<QuotaKey, string> = {
  workersRequests: 'Workers requests',
  d1RowsWritten: 'D1 rows written',
  d1RowsRead: 'D1 rows read',
}

export type QuotaItem = {
  key: QuotaKey
  label: string
  used: number
  limit: number
  ratio: number
  alert: boolean
}

export const ALERT_THRESHOLD = 0.7

const KEYS: QuotaKey[] = ['workersRequests', 'd1RowsWritten', 'd1RowsRead']

export const quotaStatus = (
  usage: Usage,
  limits: Usage = FREE_LIMITS,
  threshold = ALERT_THRESHOLD,
): QuotaItem[] =>
  KEYS.map((key) => {
    const ratio = limits[key] > 0 ? usage[key] / limits[key] : 0
    return {
      key,
      label: QUOTA_LABELS[key],
      used: usage[key],
      limit: limits[key],
      ratio,
      alert: ratio >= threshold,
    }
  })
