/**
 * Cloudflare GraphQL → Grafana Cloud（OTLP metrics）への転送（ADR-0008）。
 * `.github/workflows/observability.yml` が 5 分ごとに実行する。
 *
 *   bun scripts/observability/push-metrics.ts [--dry-run]
 *
 * 環境変数:
 *   CLOUDFLARE_ANALYTICS_TOKEN / CLOUDFLARE_ACCOUNT_ID  … Account Analytics: Read だけのトークン
 *   GRAFANA_METRICS_PUSH_URL    … スタックの OTLP gateway（例 https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp）
 *   GRAFANA_METRICS_PUSH_USER   … スタック ID（OTLP の basic auth ユーザー）
 *   GRAFANA_METRICS_PUSH_TOKEN  … metrics:write だけの access policy token
 *   D1_DATABASE_NAMES           … 任意。{"<database id>":"<name>"} の JSON
 */

import { loadTools, type Registry, type Result } from '../lib/tools.ts'
import {
  BASIC_FIELDS,
  EXTENDED_FIELDS,
  buildD1Query,
  buildWorkersQuery,
  d1Samples,
  mergeSamples,
  parseD1Groups,
  parseWorkersGroups,
  settledWindows,
  toSamples,
  type FieldSet,
  type QueryFailure,
  type Sample,
  type Window,
  type WorkersGroup,
  workersQueryVariables,
} from './metrics.ts'
import { toOtlpMetrics } from './otlp.ts'

const CLOUDFLARE_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

export type Env = Record<string, string | undefined>

export type Deps = {
  fetch: typeof fetch
  now: () => Date
  env: Env
  log: (message: string) => void
}

type Config = {
  accountId: string
  cloudflareToken: string
  pushUrl: string
  pushUser: string
  pushToken: string
  databaseNames: Map<string, string>
}

const REQUIRED = [
  'CLOUDFLARE_ANALYTICS_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'GRAFANA_METRICS_PUSH_URL',
  'GRAFANA_METRICS_PUSH_USER',
  'GRAFANA_METRICS_PUSH_TOKEN',
] as const

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const parseNames = (raw: string | undefined): Map<string, string> => {
  if (raw === undefined || raw.trim() === '') return new Map()
  const parsed = safeJson(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map()
  return new Map(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
}

export const readConfig = (env: Env): Result<Config, string[]> => {
  const missing = REQUIRED.filter((name) => (env[name] ?? '') === '')
  if (missing.length > 0) return { ok: false, error: missing }
  return {
    ok: true,
    value: {
      accountId: env['CLOUDFLARE_ACCOUNT_ID'] ?? '',
      cloudflareToken: env['CLOUDFLARE_ANALYTICS_TOKEN'] ?? '',
      pushUrl: (env['GRAFANA_METRICS_PUSH_URL'] ?? '').replace(/\/+$/, ''),
      pushUser: env['GRAFANA_METRICS_PUSH_USER'] ?? '',
      pushToken: env['GRAFANA_METRICS_PUSH_TOKEN'] ?? '',
      databaseNames: parseNames(env['D1_DATABASE_NAMES']),
    },
  }
}

const graphql = async (
  deps: Deps,
  config: Config,
  query: string,
  variables: Record<string, string>,
): Promise<unknown> => {
  const response = await deps.fetch(CLOUDFLARE_GRAPHQL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.cloudflareToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  return response.json()
}

const queryWorkers = async (
  deps: Deps,
  config: Config,
  fields: FieldSet,
  window: Window,
): Promise<Result<WorkersGroup[], QueryFailure>> =>
  parseWorkersGroups(
    await graphql(
      deps,
      config,
      buildWorkersQuery(fields),
      workersQueryVariables(config.accountId, window),
    ),
  )

/** 拡張フィールドで取り、スキーマに無いと言われたら docs で確認済みのフィールドで取り直す。 */
const workersForWindows = async (
  deps: Deps,
  config: Config,
  registry: Registry,
  windows: readonly Window[],
): Promise<Result<Sample[], string>> => {
  const probe = windows[0]
  if (probe === undefined) return { ok: true, value: [] }
  const first = await queryWorkers(deps, config, EXTENDED_FIELDS, probe)
  const fields = !first.ok && first.error.schema ? BASIC_FIELDS : EXTENDED_FIELDS
  if (fields === BASIC_FIELDS) {
    deps.log(
      `extended fields rejected (${first.ok ? '' : first.error.message}); using the basic set`,
    )
  }
  const results = await Promise.all(
    windows.map(async (window) => ({
      window,
      result: await queryWorkers(deps, config, fields, window),
    })),
  )
  const failures = results.flatMap(({ result }) => (result.ok ? [] : [result.error.message]))
  if (failures.length > 0) return { ok: false, error: failures.join('\n') }
  const samples = results.flatMap(({ window, result }) =>
    result.ok ? toSamples(registry, result.value, window) : [],
  )
  return { ok: true, value: samples }
}

/** 当日（UTC）の Workers リクエスト総数。無料枠（100k/日）の消費率に使う。 */
const workersToday = async (deps: Deps, config: Config, now: Date): Promise<Sample[]> => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const result = await queryWorkers(deps, config, BASIC_FIELDS, { start, end: now })
  if (!result.ok) {
    deps.log(`workers today: ${result.error.message}`)
    return []
  }
  const total = result.value.reduce((acc, g) => acc + (g.sum['requests'] ?? 0), 0)
  const timestampMs = Math.floor(now.getTime() / 60_000) * 60_000
  return [{ name: 'rimltools_workers_requests_today', value: total, timestampMs, labels: {} }]
}

const d1Today = async (deps: Deps, config: Config, now: Date): Promise<Sample[]> => {
  const raw = await graphql(deps, config, buildD1Query(), {
    accountTag: config.accountId,
    date: now.toISOString().slice(0, 10),
  })
  const result = parseD1Groups(raw)
  if (!result.ok) {
    deps.log(`d1: ${result.error.message}`)
    return []
  }
  return d1Samples(result.value, config.databaseNames, Math.floor(now.getTime() / 60_000) * 60_000)
}

// Mimir は同じ時刻の sample の再送や、少し古い sample を拒否することがある。
// 窓を重ねて送る設計なので、この種の拒否は失敗にしない。
const TOLERATED =
  /duplicate sample|out of order|too old|err-mimir-sample-(duplicate|out-of-order|too-old)/i

const push = async (deps: Deps, config: Config, samples: readonly Sample[]): Promise<boolean> => {
  const payload = toOtlpMetrics(samples, {
    'service.name': 'rimltools-metrics-push',
    'service.namespace': 'rimltools',
  })
  const auth = Buffer.from(`${config.pushUser}:${config.pushToken}`).toString('base64')
  const response = await deps.fetch(`${config.pushUrl}/v1/metrics`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (response.ok) return true
  const body = await response.text()
  if (TOLERATED.test(body)) {
    deps.log(`some samples were already stored (tolerated): ${body.slice(0, 200)}`)
    return true
  }
  deps.log(`push failed: ${response.status} ${body.slice(0, 500)}`)
  return false
}

export const run = async (deps: Deps, dryRun: boolean): Promise<number> => {
  const config = readConfig(deps.env)
  if (!config.ok) {
    deps.log(`skip: not configured (${config.error.join(', ')})`)
    return 0
  }
  const registry = await loadTools()
  if (!registry.ok) {
    deps.log(registry.error)
    return 1
  }
  const now = deps.now()
  const windows = settledWindows(now, { windowMinutes: 5, settleMinutes: 10, count: 3 })
  const [workers, today, d1] = await Promise.all([
    workersForWindows(deps, config.value, registry.value, windows),
    workersToday(deps, config.value, now),
    d1Today(deps, config.value, now),
  ])
  if (!workers.ok) {
    deps.log(workers.error)
    return 1
  }
  const heartbeat: Sample = {
    name: 'rimltools_metrics_push_last_success_timestamp_seconds',
    value: Math.floor(now.getTime() / 1000),
    timestampMs: Math.floor(now.getTime() / 60_000) * 60_000,
    labels: {},
  }
  const samples = mergeSamples([...workers.value, ...today, ...d1, heartbeat])
  const series = new Set(samples.map((s) => `${s.name}${JSON.stringify(s.labels)}`)).size
  deps.log(`${samples.length} samples / ${series} series over ${windows.length} windows`)
  if (dryRun) {
    deps.log(JSON.stringify(toOtlpMetrics(samples, {}), null, 2).slice(0, 4000))
    return 0
  }
  return (await push(deps, config.value, samples)) ? 0 : 1
}

if (import.meta.main) {
  const code = await run(
    { fetch, now: () => new Date(), env: process.env, log: (m) => console.log(m) },
    process.argv.includes('--dry-run'),
  )
  process.exit(code)
}
