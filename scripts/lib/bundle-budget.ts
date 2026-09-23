/**
 * ビルド成果物のサイズ予算（apps/<tool>/bundle-budget.json）の判定。
 * I/O（ファイル一覧と gzip）は scripts/bundle-budget.ts が行い、ここは純関数だけ。
 */

import type { Result } from './tools.ts'

export type Budget = {
  name: string
  /** プロダクト直下からの相対ディレクトリ。この中（サブディレクトリを含む）のファイルを数える */
  dir: string
  extensions: string[]
  maxGzipBytes: number
  /** 閾値の根拠。予算を変えるときに理由が残るよう必須にする */
  reason: string
}

export type MeasuredFile = { path: string; gzipBytes: number }

export type BudgetResult = {
  budget: Budget
  totalGzipBytes: number
  fileCount: number
  exceeded: boolean
  largest: MeasuredFile[]
}

export type BudgetReport = { ok: boolean; results: BudgetResult[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseBudget = (raw: unknown, index: number): Result<Budget, string> => {
  const at = `budgets[${index}]`
  if (!isRecord(raw)) return { ok: false, error: `${at}: expected an object` }
  const { name, dir, extensions, maxGzipBytes, reason } = raw
  if (typeof name !== 'string' || name === '') return { ok: false, error: `${at}.name: required` }
  if (typeof dir !== 'string' || dir === '') return { ok: false, error: `${at}.dir: required` }
  if (
    !Array.isArray(extensions)
    || extensions.length === 0
    || !extensions.every((e): e is string => typeof e === 'string' && e.startsWith('.'))
  ) {
    return { ok: false, error: `${at}.extensions: expected a list like [".js"]` }
  }
  if (typeof maxGzipBytes !== 'number' || !Number.isInteger(maxGzipBytes) || maxGzipBytes <= 0) {
    return { ok: false, error: `${at}.maxGzipBytes: expected a positive integer` }
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return { ok: false, error: `${at}.reason: write why this limit was chosen` }
  }
  return { ok: true, value: { name, dir, extensions, maxGzipBytes, reason } }
}

export const parseBudgetFile = (raw: unknown): Result<Budget[], string> => {
  if (!isRecord(raw) || !Array.isArray(raw['budgets'])) {
    return { ok: false, error: 'bundle-budget.json: expected { "budgets": [...] }' }
  }
  const list: unknown[] = raw['budgets']
  if (list.length === 0) return { ok: false, error: 'bundle-budget.json: budgets is empty' }
  const budgets: Budget[] = []
  const errors: string[] = []
  list.forEach((item, i) => {
    const parsed = parseBudget(item, i)
    if (parsed.ok) budgets.push(parsed.value)
    else errors.push(parsed.error)
  })
  if (errors.length > 0) return { ok: false, error: errors.join('\n') }
  return { ok: true, value: budgets }
}

const trimSlashes = (path: string): string => {
  let start = 0
  let end = path.length
  while (start < end && path[start] === '/') start += 1
  while (end > start && path[end - 1] === '/') end -= 1
  return path.slice(start, end)
}

const inside = (dir: string, path: string): boolean => {
  const base = trimSlashes(dir)
  return path.startsWith(`${base}/`)
}

const LARGEST = 10

export const checkBudgets = (budgets: Budget[], files: MeasuredFile[]): BudgetReport => {
  const results = budgets.map((budget) => {
    const matched = files.filter(
      (f) => inside(budget.dir, f.path) && budget.extensions.some((e) => f.path.endsWith(e)),
    )
    const totalGzipBytes = matched.reduce((sum, f) => sum + f.gzipBytes, 0)
    const largest = matched.toSorted((a, b) => b.gzipBytes - a.gzipBytes).slice(0, LARGEST)
    return {
      budget,
      totalGzipBytes,
      fileCount: matched.length,
      // 1 つも一致しないのは失敗（ディレクトリ名が変わって検査が素通りになるのを防ぐ）
      exceeded: matched.length === 0 || totalGzipBytes > budget.maxGzipBytes,
      largest,
    }
  })
  return { ok: results.every((r) => !r.exceeded), results }
}
