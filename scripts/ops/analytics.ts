/**
 * Cloudflare GraphQL Analytics の応答を集計できる形にする。
 * NOTE: クライアントは C レーンの scripts/lib/cloudflare.ts と統合予定（README 参照）。
 */

import type { Result } from '../lib/tools.ts'
import { at, isRecord, numberAt, stringAt } from './lib/json.ts'
import type { Usage } from './quota.ts'
import type { Traffic } from './slo.ts'

export type WorkerRow = { script: string; date: string; requests: number; errors: number }
export type D1Row = { databaseId: string; date: string; rowsRead: number; rowsWritten: number }

export const WORKERS_QUERY = `query WorkersUsage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
        sum { requests errors }
        dimensions { scriptName date }
      }
    }
  }
}`

export const D1_QUERY = `query D1Usage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
        sum { rowsRead rowsWritten }
        dimensions { date databaseId }
      }
    }
  }
}`

const graphqlErrors = (json: unknown): string | undefined => {
  const errors = at(json, 'errors')
  if (!Array.isArray(errors) || errors.length === 0) return undefined
  return errors.map((e) => stringAt(e, 'message') ?? JSON.stringify(e)).join('; ')
}

const datasetRows = (json: unknown, dataset: string): Result<unknown[], string> => {
  const errors = graphqlErrors(json)
  if (errors !== undefined) return { ok: false, error: `GraphQL: ${errors}` }
  const rows = at(json, 'data', 'viewer', 'accounts', 0, dataset)
  if (!Array.isArray(rows)) return { ok: false, error: `GraphQL: missing ${dataset} in response` }
  return { ok: true, value: rows }
}

export const parseWorkerRows = (json: unknown): Result<WorkerRow[], string> => {
  const rows = datasetRows(json, 'workersInvocationsAdaptive')
  if (!rows.ok) return rows
  const out: WorkerRow[] = []
  for (const row of rows.value) {
    const script = stringAt(row, 'dimensions', 'scriptName')
    const date = stringAt(row, 'dimensions', 'date')
    const requests = numberAt(row, 'sum', 'requests')
    const errors = numberAt(row, 'sum', 'errors')
    if (
      !isRecord(row)
      || script === undefined
      || date === undefined
      || requests === undefined
      || errors === undefined
    ) {
      return { ok: false, error: `GraphQL: unexpected workers row ${JSON.stringify(row)}` }
    }
    out.push({ script, date, requests, errors })
  }
  return { ok: true, value: out }
}

export const parseD1Rows = (json: unknown): Result<D1Row[], string> => {
  const rows = datasetRows(json, 'd1AnalyticsAdaptiveGroups')
  if (!rows.ok) return rows
  const out: D1Row[] = []
  for (const row of rows.value) {
    const databaseId = stringAt(row, 'dimensions', 'databaseId')
    const date = stringAt(row, 'dimensions', 'date')
    const rowsRead = numberAt(row, 'sum', 'rowsRead')
    const rowsWritten = numberAt(row, 'sum', 'rowsWritten')
    if (
      databaseId === undefined
      || date === undefined
      || rowsRead === undefined
      || rowsWritten === undefined
    ) {
      return { ok: false, error: `GraphQL: unexpected D1 row ${JSON.stringify(row)}` }
    }
    out.push({ databaseId, date, rowsRead, rowsWritten })
  }
  return { ok: true, value: out }
}

export const sumTraffic = (rows: WorkerRow[], scripts: string[]): Traffic => {
  const names = new Set(scripts)
  return rows
    .filter((r) => names.has(r.script))
    .reduce((acc, r) => ({ requests: acc.requests + r.requests, errors: acc.errors + r.errors }), {
      requests: 0,
      errors: 0,
    })
}

/** 無料枠はアカウント全体の日次合計で判定する（スクリプト・DB で絞らない）。 */
export const usageOn = (date: string, workers: WorkerRow[], d1: D1Row[]): Usage => {
  const w = workers.filter((r) => r.date === date)
  const d = d1.filter((r) => r.date === date)
  return {
    workersRequests: w.reduce((n, r) => n + r.requests, 0),
    d1RowsRead: d.reduce((n, r) => n + r.rowsRead, 0),
    d1RowsWritten: d.reduce((n, r) => n + r.rowsWritten, 0),
  }
}
