/**
 * ローカルの LGTM（ops/local/compose.yaml）が動いているかを確かめる。
 *
 *   docker compose -f ops/local/compose.yaml up -d
 *   bun scripts/ops/local-smoke.ts
 *
 * 1. 本番と同じ形（@rimltools/telemetry の OTLP/JSON）の trace と log を collector に送る
 * 2. Faro の payload を Alloy（faro.receiver）に送る
 * 3. Grafana のデータソース（本番と同じ uid）経由で、それぞれが取れるまで待つ
 *    - Tempo に trace がある / Loki に trace_id 付きのログがある
 *    - Prometheus に span metrics と、recording rule の rimltools_worker_requests がある
 *    - Loki に Faro のログがある
 */

import { toOtlpLogs, toOtlpTraces, type Resource } from '@rimltools/telemetry/core'

export type SmokeSample = {
  readonly traceId: string
  readonly marker: string
  readonly traces: ReturnType<typeof toOtlpTraces>
  readonly logs: ReturnType<typeof toOtlpLogs>
}

const SERVICE = 'qrcc-web'

/** 本番の Worker が送るのと同じ resource（docs/ops/telemetry.md の契約）。環境だけ local */
const RESOURCE: Resource = {
  'service.name': SERVICE,
  'service.namespace': 'rimltools',
  'service.version': 'local-smoke',
  'deployment.environment.name': 'local',
}

export const sampleTelemetry = (deps: {
  readonly nowMs: number
  readonly randomHex: (length: number) => string
}): SmokeSample => {
  const traceId = deps.randomHex(32)
  const spanId = deps.randomHex(16)
  const marker = `local-smoke-${traceId.slice(0, 8)}`
  const startMs = deps.nowMs - 120
  const traces = toOtlpTraces(RESOURCE, [
    {
      traceId,
      spanId,
      parentSpanId: undefined,
      name: 'GET /',
      kind: 'server',
      startMs,
      endMs: deps.nowMs,
      attributes: {
        'http.request.method': 'GET',
        'http.route': '/',
        'http.response.status_code': 200,
        'sampling.reason': 'head',
      },
      status: { code: 'unset' },
      events: [],
    },
  ])
  const logs = toOtlpLogs(RESOURCE, [
    {
      timeMs: deps.nowMs,
      severity: 'info',
      body: `smoke log ${marker}`,
      attributes: { event: 'local_smoke' },
      traceId,
      spanId,
    },
  ])
  return { traceId, marker, traces, logs }
}

/** Faro Web SDK が送るものの最小形（ログ 1 行） */
export const faroPayload = (input: {
  readonly nowMs: number
  readonly marker: string
  readonly app: string
}) => ({
  meta: {
    app: { name: input.app, version: 'local-smoke', environment: 'local' },
    session: { id: input.marker },
  },
  logs: [
    {
      message: `faro smoke ${input.marker}`,
      level: 'info',
      timestamp: new Date(input.nowMs).toISOString(),
      context: {},
    },
  ],
  measurements: [],
  events: [],
  exceptions: [],
  traces: undefined,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const nonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0

/** Tempo の /api/traces/<id> の応答に trace が入っているか */
export const tempoHasTrace = (body: unknown): boolean =>
  isRecord(body) && (nonEmptyArray(body['batches']) || nonEmptyArray(body['resourceSpans']))

/** Loki の query_range の応答に含まれる行数 */
export const lokiLineCount = (body: unknown): number => {
  if (!isRecord(body) || !isRecord(body['data'])) return 0
  const result = body['data']['result']
  if (!Array.isArray(result)) return 0
  return result.reduce<number>((total, stream: unknown) => {
    if (!isRecord(stream) || !Array.isArray(stream['values'])) return total
    return total + stream['values'].length
  }, 0)
}

/** Prometheus の instant query の応答に系列が 1 つ以上あるか */
export const hasPrometheusSeries = (body: unknown): boolean =>
  isRecord(body) && isRecord(body['data']) && nonEmptyArray(body['data']['result'])

// ---- 以下は I/O（CLI）--------------------------------------------------------------

const GRAFANA = process.env['GRAFANA_URL'] ?? 'http://127.0.0.1:3000'
const OTLP = process.env['OTLP_URL'] ?? 'http://127.0.0.1:4318'
const FARO = process.env['FARO_URL'] ?? 'http://127.0.0.1:12347/collect'
const TIMEOUT_MS = Number(process.env['SMOKE_TIMEOUT_MS'] ?? 180_000)

const randomHex = (length: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(length / 2)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

const post = async (url: string, body: unknown): Promise<boolean> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
  return response?.ok === true
}

const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(`${GRAFANA}${path}`).catch(() => undefined)
  if (response?.ok !== true) return undefined
  return response.json().catch(() => undefined)
}

const POLL_MS = 3000

/** check が true を返すまで、TIMEOUT_MS を上限に 3 秒おきに試す（前の結果を見て次を決めるので逐次） */
const waitFor = async (label: string, check: () => Promise<boolean>): Promise<boolean> => {
  const started = Date.now()
  const attempt = async (): Promise<boolean> => {
    if (await check()) {
      console.log(`ok   ${label} (${Math.round((Date.now() - started) / 1000)}s)`)
      return true
    }
    if (Date.now() - started >= TIMEOUT_MS) {
      console.error(`FAIL ${label} (timed out after ${TIMEOUT_MS / 1000}s)`)
      return false
    }
    await Bun.sleep(POLL_MS)
    return attempt()
  }
  return attempt()
}

/** Grafana のデータソース（uid）越しに各バックエンドの API を叩くパス */
const ds = (uid: string) => `/api/datasources/proxy/uid/${uid}`

const main = async (): Promise<number> => {
  const ready = await waitFor('Grafana が起動している', async () => {
    const health = await getJson('/api/health')
    return isRecord(health) && health['database'] === 'ok'
  })
  if (!ready) return 1

  const sample = sampleTelemetry({ nowMs: Date.now(), randomHex })
  const sent = await waitFor('OTLP（trace / log）を送れた', async () => {
    const [traces, logs] = await Promise.all([
      post(`${OTLP}/v1/traces`, sample.traces),
      post(`${OTLP}/v1/logs`, sample.logs),
    ])
    return traces && logs
  })
  const faro = await waitFor('Faro の payload を送れた', () =>
    post(FARO, faroPayload({ nowMs: Date.now(), marker: sample.marker, app: 'qrcc' })),
  )
  if (!sent || !faro) return 1

  const since = `start=${(Date.now() - 15 * 60_000) * 1_000_000}`
  const results = [
    await waitFor('Tempo に trace が入った（rt-tempo）', async () =>
      tempoHasTrace(await getJson(`${ds('rt-tempo')}/api/traces/${sample.traceId}`)),
    ),
    await waitFor('Loki に trace_id 付きのログが入った（rt-loki）', async () => {
      const query = encodeURIComponent(`{service_name="${SERVICE}"} |= "${sample.marker}"`)
      return (
        lokiLineCount(
          await getJson(`${ds('rt-loki')}/loki/api/v1/query_range?query=${query}&${since}`),
        ) > 0
      )
    }),
    await waitFor('span metrics ができた（rt-mimir: traces_spanmetrics_calls_total）', async () => {
      const query = encodeURIComponent(`traces_spanmetrics_calls_total{service="${SERVICE}"}`)
      return hasPrometheusSeries(await getJson(`${ds('rt-mimir')}/api/v1/query?query=${query}`))
    }),
    await waitFor('recording rule が動いた（rimltools_worker_requests{tool="qrcc"}）', async () => {
      const query = encodeURIComponent(
        'rimltools_worker_requests{tool="qrcc", environment="local"}',
      )
      return hasPrometheusSeries(await getJson(`${ds('rt-mimir')}/api/v1/query?query=${query}`))
    }),
    await waitFor('Loki に Faro のログが入った', async () => {
      const query = encodeURIComponent(`{source="faro"} |= "${sample.marker}"`)
      return (
        lokiLineCount(
          await getJson(`${ds('rt-loki')}/loki/api/v1/query_range?query=${query}&${since}`),
        ) > 0
      )
    }),
  ]
  console.log(`trace: ${GRAFANA}/explore（Tempo で ${sample.traceId}）`)
  return results.every(Boolean) ? 0 : 1
}

if (import.meta.main) process.exit(await main())
