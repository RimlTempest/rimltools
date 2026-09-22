/**
 * Cloudflare の GraphQL Analytics から Workers / D1 の指標を取り、Grafana Cloud（Mimir）へ送る
 * ための純関数（ADR-0008）。Workers は metrics の OTLP export を持たないので、ここで補う。
 *
 * 取得は 5 分窓ごと。各窓の値を「窓の終わり」の時刻で gauge として送る。
 * 同じ窓を数回送る（冪等）ので、GitHub の cron が遅れても欠けない。
 */

import type { Registry, Result } from '../lib/tools.ts'

// ---- 取得する窓 -----------------------------------------------------------------

export type Window = { start: Date; end: Date }

export type WindowOptions = {
  /** 窓の長さ（分） */
  windowMinutes: number
  /** 集計が落ち着くまで待つ時間（分）。これより新しい窓は送らない */
  settleMinutes: number
  /** 1 回に送る窓の数（重ねて送り、cron の遅延・欠落を吸収する） */
  count: number
}

export const settledWindows = (now: Date, options: WindowOptions): Window[] => {
  const size = options.windowMinutes * 60_000
  const latestEnd = Math.floor((now.getTime() - options.settleMinutes * 60_000) / size) * size
  return Array.from({ length: options.count }, (_, i) => {
    const end = latestEnd - (options.count - 1 - i) * size
    return { start: new Date(end - size), end: new Date(end) }
  })
}

// ---- Workers の問い合わせ ----------------------------------------------------------

export type FieldSet = {
  dimensions: readonly string[]
  sum: readonly string[]
  quantiles: readonly string[]
}

/**
 * Cloudflare の docs で確認できたフィールドだけ
 * （https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/）。
 */
export const BASIC_FIELDS: FieldSet = {
  dimensions: ['scriptName', 'status'],
  sum: ['requests', 'errors', 'subrequests'],
  quantiles: ['cpuTimeP50', 'cpuTimeP99'],
}

/**
 * 版ごとの比較（カナリア）と wall time の p99 に使う拡張フィールド。スキーマに無ければ
 * GraphQL がエラーを返すので、そのときは BASIC_FIELDS で取り直す（isSchemaError）。
 */
export const EXTENDED_FIELDS: FieldSet = {
  dimensions: ['scriptName', 'scriptVersion', 'status'],
  sum: ['requests', 'errors', 'subrequests'],
  quantiles: ['cpuTimeP50', 'cpuTimeP99', 'wallTimeP50', 'wallTimeP90', 'wallTimeP99'],
}

/**
 * docs で確認できた時刻フィルタは datetime_geq / datetime_leq（両端を含む）。窓の境界が
 * 隣の窓と重ならないよう、終わりは 1 秒手前にする（workersQueryVariables）。
 */
export const workersQueryVariables = (accountTag: string, window: Window) => ({
  accountTag,
  start: window.start.toISOString(),
  end: new Date(window.end.getTime() - 1000).toISOString(),
})

export const buildWorkersQuery = (fields: FieldSet): string =>
  [
    'query Workers($accountTag: string!, $start: Time!, $end: Time!) {',
    '  viewer {',
    '    accounts(filter: { accountTag: $accountTag }) {',
    '      workersInvocationsAdaptive(',
    '        limit: 10000',
    '        filter: { datetime_geq: $start, datetime_leq: $end }',
    '      ) {',
    `        sum { ${fields.sum.join(' ')} }`,
    `        quantiles { ${fields.quantiles.join(' ')} }`,
    `        dimensions { ${fields.dimensions.join(' ')} }`,
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n')

export type GraphQLError = { message: string }

export const isSchemaError = (errors: readonly GraphQLError[]): boolean =>
  errors.some((e) => /unknown field|cannot query field|unknown argument/i.test(e.message))

export type QueryFailure = { schema: boolean; message: string }

export type WorkersGroup = {
  scriptName: string
  scriptVersion: string
  status: string
  sum: Record<string, number>
  quantiles: Record<string, number>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numbers = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )
}

const graphqlErrors = (raw: unknown): GraphQLError[] => {
  if (!isRecord(raw) || !Array.isArray(raw['errors'])) return []
  return raw['errors'].flatMap((e: unknown) =>
    isRecord(e) && typeof e['message'] === 'string' ? [{ message: e['message'] }] : [],
  )
}

/** `data.viewer.accounts[0].<dataset>` を取り出す。GraphQL のエラーは失敗として返す。 */
const datasetRows = (raw: unknown, dataset: string): Result<unknown[], QueryFailure> => {
  const errors = graphqlErrors(raw)
  if (errors.length > 0) {
    return {
      ok: false,
      error: { schema: isSchemaError(errors), message: errors.map((e) => e.message).join('; ') },
    }
  }
  const data = isRecord(raw) ? raw['data'] : undefined
  const viewer = isRecord(data) ? data['viewer'] : undefined
  const accounts = isRecord(viewer) ? viewer['accounts'] : undefined
  const account: unknown = Array.isArray(accounts) ? accounts[0] : undefined
  const rows = isRecord(account) ? account[dataset] : undefined
  if (!Array.isArray(rows)) {
    return { ok: false, error: { schema: false, message: `no ${dataset} in the response` } }
  }
  return { ok: true, value: rows }
}

export const parseWorkersGroups = (raw: unknown): Result<WorkersGroup[], QueryFailure> => {
  const rows = datasetRows(raw, 'workersInvocationsAdaptive')
  if (!rows.ok) return rows
  const groups = rows.value.flatMap((row): WorkersGroup[] => {
    if (!isRecord(row)) return []
    const dimensions = row['dimensions']
    if (!isRecord(dimensions)) return []
    const { scriptName, scriptVersion, status } = dimensions
    const sum = numbers(row['sum'])
    if (typeof scriptName !== 'string' || typeof status !== 'string') return []
    if (sum['requests'] === undefined) return []
    return [
      {
        scriptName,
        scriptVersion: typeof scriptVersion === 'string' ? scriptVersion : '',
        status,
        sum,
        quantiles: numbers(row['quantiles']),
      },
    ]
  })
  return { ok: true, value: groups }
}

// ---- D1 --------------------------------------------------------------------------

/** D1 の集計は日単位（docs で確認できたのは date フィルタだけ）。当日の累計を送る。 */
export const buildD1Query = (): string =>
  [
    'query D1($accountTag: string!, $date: Date!) {',
    '  viewer {',
    '    accounts(filter: { accountTag: $accountTag }) {',
    '      d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date: $date }) {',
    '        sum { rowsRead rowsWritten }',
    '        dimensions { databaseId }',
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n')

export type D1Usage = { databaseId: string; rowsRead: number; rowsWritten: number }

export const parseD1Groups = (raw: unknown): Result<D1Usage[], QueryFailure> => {
  const rows = datasetRows(raw, 'd1AnalyticsAdaptiveGroups')
  if (!rows.ok) return rows
  const usage = rows.value.flatMap((row): D1Usage[] => {
    if (!isRecord(row) || !isRecord(row['dimensions'])) return []
    const databaseId = row['dimensions']['databaseId']
    const sum = numbers(row['sum'])
    if (typeof databaseId !== 'string') return []
    return [{ databaseId, rowsRead: sum['rowsRead'] ?? 0, rowsWritten: sum['rowsWritten'] ?? 0 }]
  })
  return { ok: true, value: usage }
}

// ---- 指標への変換 --------------------------------------------------------------------

export type Sample = {
  name: string
  value: number
  timestampMs: number
  labels: Record<string, string>
}

export type Identity = { tool: string; environment: string }

const STAGING_SUFFIX = '-staging'

/** Worker 名 → ツールと環境（tools.json の workers と `-staging` 接尾辞）。 */
export const scriptIdentity = (registry: Registry, script: string): Identity => {
  const staging = script.endsWith(STAGING_SUFFIX)
  const base = staging ? script.slice(0, -STAGING_SUFFIX.length) : script
  const tool = registry.tools.find((t) => t.workers.some((w) => w.name === base))
  if (tool === undefined) return { tool: 'unknown', environment: 'unknown' }
  return { tool: tool.name, environment: staging ? 'staging' : 'production' }
}

/**
 * Workers の invocation status を ok / error の 2 値に畳む（series を増やさないため）。
 * clientDisconnected は利用者側の切断なのでサーバーエラーとみなさない。
 */
export const statusClass = (status: string): 'ok' | 'error' =>
  status === 'success' || status === 'clientDisconnected' ? 'ok' : 'error'

const QUANTILE_METRICS: readonly { field: string; name: string; quantile: string }[] = [
  { field: 'cpuTimeP50', name: 'rimltools_worker_cpu_time_ms', quantile: '0.5' },
  { field: 'cpuTimeP99', name: 'rimltools_worker_cpu_time_ms', quantile: '0.99' },
  { field: 'wallTimeP50', name: 'rimltools_worker_wall_time_ms', quantile: '0.5' },
  { field: 'wallTimeP90', name: 'rimltools_worker_wall_time_ms', quantile: '0.9' },
  { field: 'wallTimeP99', name: 'rimltools_worker_wall_time_ms', quantile: '0.99' },
]

const SUM_METRICS: readonly { field: string; name: string }[] = [
  { field: 'requests', name: 'rimltools_worker_requests' },
  { field: 'errors', name: 'rimltools_worker_errors' },
  { field: 'subrequests', name: 'rimltools_worker_subrequests' },
]

export const toSamples = (
  registry: Registry,
  groups: readonly WorkersGroup[],
  window: Window,
): Sample[] => {
  const timestampMs = window.end.getTime()
  return groups.flatMap((group) => {
    const labels = {
      ...scriptIdentity(registry, group.scriptName),
      script: group.scriptName,
      version: group.scriptVersion,
      status_class: statusClass(group.status),
    }
    const sums = SUM_METRICS.flatMap(({ field, name }) => {
      const value = group.sum[field]
      return value === undefined ? [] : [{ name, value, timestampMs, labels }]
    })
    const quantiles = QUANTILE_METRICS.flatMap(({ field, name, quantile }) => {
      const value = group.quantiles[field]
      return value === undefined
        ? []
        : [{ name, value, timestampMs, labels: { ...labels, quantile } }]
    })
    return [...sums, ...quantiles]
  })
}

/**
 * 同じラベル組が 1 つの窓に複数あると（status を ok / error に畳んだ結果など）、
 * Mimir は同時刻の重複 sample を拒否する。件数は足し、分位点は大きい方（悲観側）を残す。
 */
export const mergeSamples = (samples: readonly Sample[]): Sample[] => {
  const merged = new Map<string, Sample>()
  for (const sample of samples) {
    const key = `${sample.name}|${sample.timestampMs}|${JSON.stringify(Object.entries(sample.labels).toSorted(([a], [b]) => a.localeCompare(b)))}`
    const existing = merged.get(key)
    if (existing === undefined) {
      merged.set(key, sample)
      continue
    }
    const isQuantile = sample.labels['quantile'] !== undefined
    merged.set(key, {
      ...existing,
      value: isQuantile ? Math.max(existing.value, sample.value) : existing.value + sample.value,
    })
  }
  return [...merged.values()]
}

export const d1Samples = (
  usage: readonly D1Usage[],
  databaseNames: ReadonlyMap<string, string>,
  timestampMs: number,
): Sample[] =>
  usage.flatMap((u) => {
    const labels = { database: databaseNames.get(u.databaseId) ?? u.databaseId }
    return [
      { name: 'rimltools_d1_rows_read_today', value: u.rowsRead, timestampMs, labels },
      { name: 'rimltools_d1_rows_written_today', value: u.rowsWritten, timestampMs, labels },
    ]
  })
