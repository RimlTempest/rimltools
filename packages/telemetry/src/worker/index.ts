/**
 * Workers 用の計装（docs/ops/telemetry.md）。
 *
 * Workers の OTLP 自動エクスポートは Workers Paid 限定なので、Free では Worker 自身が
 * OTLP/HTTP JSON を組み立てて送る。OpenTelemetry JS SDK は CPU とバンドルが重いので使わない。
 *
 *   export default { fetch: instrument(handler, { serviceName: 'qrcc-web' }) }
 *
 * - リクエストごとに root span（SERVER）を作り、traced() / withSpan() で子 span を足す
 * - 送るかどうかは応答後に決める（head sampling + エラー・遅延は必ず送る tail 判定）
 * - 送信は ctx.waitUntil で応答の後。失敗してもリクエストは壊さない
 * - OTEL_EXPORTER_OTLP_ENDPOINT が無ければ何もしない（ローカル・テスト・未設定の本番）
 */

import { AsyncLocalStorage } from 'node:async_hooks'

import { browserConfigFromEnv, browserMetaHtml } from '../core/browser-config.ts'
import { readConfig, type TelemetryConfig } from '../core/config.ts'
import {
  toOtlpLogs,
  toOtlpTraces,
  type AttributeValue,
  type Attributes,
  type LogRecord,
  type Severity,
  type SpanEvent,
  type SpanKind,
  type SpanRecord,
  type SpanStatus,
} from '../core/otlp.ts'
import { normalizePath } from '../core/route.ts'
import { exportDecision, headDecision, type HeadDecision } from '../core/sampling.ts'
import {
  formatTraceparent,
  newSpanId,
  newTraceId,
  parseTraceparent,
  type FillRandom,
} from '../core/tracecontext.ts'

export type WorkerDeps = {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  /** epoch ms。Workers では I/O の間だけ進む（Spectre 対策）ので、計測は I/O 待ちの時間になる */
  readonly now: () => number
  readonly random: () => number
  readonly fillRandom: FillRandom
  /** 1 行の構造化ログ（Workers Logs に載る） */
  readonly print: (line: string) => void
}

export type ExecutionContextLike = { waitUntil: (promise: Promise<unknown>) => void }

export type FetchHandler<E> = (
  request: Request,
  env: E,
  ctx: ExecutionContextLike,
) => Promise<Response>

export type InstrumentOptions = {
  /** OTEL_SERVICE_NAME が無いときの service.name。Worker 名にする（例: qrcc-web） */
  readonly serviceName: string
  /** http.route（低カーディナリティのテンプレート）。無ければ ID を伏せたパス */
  readonly route?: (url: URL) => string | undefined
  /**
   * HTML 応答の <head> に Faro の設定と traceparent を埋め込む（FARO_URL があるときだけ）。
   * HTMLRewriter はランタイムの型なので、プロダクト側から渡す。
   */
  readonly browser?: {
    readonly app: string
    readonly rewrite: (response: Response, headHtml: string) => Response
  }
}

type TraceState = {
  readonly traceId: string
  readonly rootSpanId: string
  readonly head: HeadDecision
  readonly spans: SpanRecord[]
  readonly logs: LogRecord[]
  readonly deps: WorkerDeps
  currentSpanId: string
}

const storage = new AsyncLocalStorage<TraceState>()

export const defaultDeps: WorkerDeps = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  random: () => Math.random(),
  fillRandom: (bytes) => crypto.getRandomValues(bytes),
  // oxlint-disable-next-line eslint/no-console -- 構造化ログの出口はここだけ
  print: (line) => console.log(line),
}

const reported = new Set<string>()

const reportOnce = (deps: WorkerDeps, message: string) => {
  if (reported.has(message)) return
  reported.add(message)
  deps.print(JSON.stringify({ level: 'error', message: `telemetry disabled: ${message}` }))
}

const MAX_STACK = 4000

const exceptionEvent = (error: unknown, timeMs: number): SpanEvent => {
  const isError = error instanceof Error
  return {
    name: 'exception',
    timeMs,
    attributes: {
      'exception.type': isError ? error.name : typeof error,
      'exception.message': isError ? error.message : String(error),
      ...(isError && error.stack !== undefined
        ? { 'exception.stacktrace': error.stack.slice(0, MAX_STACK) }
        : {}),
    },
  }
}

const colo = (request: Request): string | undefined => {
  const cf: unknown = Reflect.get(request, 'cf')
  if (typeof cf !== 'object' || cf === null) return undefined
  const value: unknown = Reflect.get(cf, 'colo')
  return typeof value === 'string' ? value : undefined
}

const statusOf = (status: number): SpanStatus =>
  status >= 500 ? { code: 'error', message: `HTTP ${status}` } : { code: 'unset' }

const send = async (config: TelemetryConfig, state: TraceState, spans: SpanRecord[]) => {
  const post = async (url: string, body: unknown) => {
    const response = await state.deps.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...config.headers },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  }
  try {
    await Promise.all([
      post(config.tracesUrl, toOtlpTraces(config.resource, spans)),
      ...(state.logs.length > 0
        ? [post(config.logsUrl, toOtlpLogs(config.resource, state.logs))]
        : []),
    ])
  } catch (error) {
    state.deps.print(
      JSON.stringify({ level: 'warn', message: 'telemetry export failed', detail: String(error) }),
    )
  }
}

const isHtml = (response: Response) =>
  response.status === 200 && (response.headers.get('content-type') ?? '').includes('text/html')

export const instrument =
  <E extends object>(
    handler: FetchHandler<E>,
    options: InstrumentOptions,
    deps: WorkerDeps = defaultDeps,
  ): FetchHandler<E> =>
  async (request, env, ctx) => {
    const browser =
      options.browser === undefined ? null : browserConfigFromEnv(env, options.browser.app)
    const withBrowser = (response: Response, traceparent: string | undefined) =>
      browser !== null && options.browser !== undefined && isHtml(response)
        ? options.browser.rewrite(response, browserMetaHtml(browser, traceparent))
        : response

    const config = readConfig(env, { serviceName: options.serviceName })
    if (!config.ok) reportOnce(deps, config.error)
    if (!config.ok || config.value === null) {
      return withBrowser(await handler(request, env, ctx), undefined)
    }
    const telemetry = config.value

    const parent = parseTraceparent(request.headers.get('traceparent'))
    const head = headDecision({
      parentSampled: parent.ok ? parent.value.sampled : undefined,
      ratio: telemetry.ratio,
      random: deps.random(),
    })
    const rootSpanId = newSpanId(deps.fillRandom)
    const state: TraceState = {
      traceId: parent.ok ? parent.value.traceId : newTraceId(deps.fillRandom),
      rootSpanId,
      head,
      spans: [],
      logs: [],
      deps,
      currentSpanId: rootSpanId,
    }

    const url = new URL(request.url)
    const route = options.route?.(url)
    const start = deps.now()
    const events: SpanEvent[] = []
    let status = 500
    let failed = false

    const finish = () => {
      const end = deps.now()
      const decision = exportDecision({
        head,
        status,
        error: failed,
        durationMs: end - start,
        slowMs: telemetry.slowMs,
        ratio: telemetry.ratio,
      })
      if (!decision.export) return
      const attributes: Record<string, AttributeValue> = {
        'http.request.method': request.method,
        'url.path': url.pathname,
        'url.scheme': url.protocol.replace(':', ''),
        'server.address': url.hostname,
        'http.response.status_code': status,
        'sampling.reason': decision.reason,
      }
      if (route !== undefined) attributes['http.route'] = route
      if (decision.ratio !== undefined) attributes['sampling.ratio'] = decision.ratio
      const where = colo(request)
      if (where !== undefined) attributes['cloudflare.colo'] = where
      const root: SpanRecord = {
        traceId: state.traceId,
        spanId: rootSpanId,
        parentSpanId: parent.ok ? parent.value.parentSpanId : undefined,
        name: `${request.method} ${route ?? normalizePath(url.pathname)}`,
        kind: 'server',
        startMs: start,
        endMs: end,
        attributes,
        status: failed ? { code: 'error', message: 'exception' } : statusOf(status),
        events,
      }
      ctx.waitUntil(send(telemetry, state, [root, ...state.spans]))
    }

    const traceparent = formatTraceparent({
      traceId: state.traceId,
      spanId: rootSpanId,
      sampled: head.sampled,
    })

    try {
      const response = await storage.run(state, () => handler(request, env, ctx))
      status = response.status
      finish()
      return withBrowser(response, traceparent)
    } catch (error) {
      failed = true
      events.push(exceptionEvent(error, deps.now()))
      finish()
      throw error
    }
  }

const recordSpan = async <T>(
  name: string,
  kind: SpanKind,
  attributes: Attributes,
  run: (state: TraceState | undefined, spanId: string) => Promise<T>,
  statusOfResult: (value: T) => { status: SpanStatus; attributes: Attributes } = () => ({
    status: { code: 'unset' },
    attributes: {},
  }),
): Promise<T> => {
  const state = storage.getStore()
  if (state === undefined) return run(undefined, '')
  const spanId = newSpanId(state.deps.fillRandom)
  const parentSpanId = state.currentSpanId
  const start = state.deps.now()
  const push = (status: SpanStatus, extra: Attributes, events: SpanEvent[]) =>
    state.spans.push({
      traceId: state.traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startMs: start,
      endMs: state.deps.now(),
      attributes: { ...attributes, ...extra },
      status,
      events,
    })
  // 子の中で作られた span は、この span の子になる（非同期で並行しても store は別物）
  const child: TraceState = { ...state, currentSpanId: spanId }
  try {
    const value = await storage.run(child, () => run(child, spanId))
    const result = statusOfResult(value)
    push(result.status, result.attributes, [])
    return value
  } catch (error) {
    push({ code: 'error', message: 'exception' }, {}, [exceptionEvent(error, state.deps.now())])
    throw error
  }
}

/** 任意の非同期処理（D1 クエリなど）を子 span で囲む。リクエストの外では素通し。 */
export const withSpan = <T>(
  name: string,
  run: () => Promise<T>,
  attributes: Attributes = {},
): Promise<T> => recordSpan(name, 'internal', attributes, () => run())

/**
 * service binding / Durable Object / 外部 fetch を子 span（CLIENT）で囲み、
 * `traceparent` を付けて下流に渡す。リクエストの外では素通し。
 *
 *   fetch: traced('qrcc-api', (request) => env.API.fetch(request))
 */
export const traced =
  (peer: string, fetcher: (request: Request) => Promise<Response>) =>
  (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
    return recordSpan(
      `${peer} ${request.method} ${path}`,
      'client',
      { 'server.address': peer, 'http.request.method': request.method, 'url.path': path },
      (state, spanId) => {
        if (state === undefined) return fetcher(request)
        const headers = new Headers(request.headers)
        headers.set(
          'traceparent',
          formatTraceparent({ traceId: state.traceId, spanId, sampled: state.head.sampled }),
        )
        return fetcher(new Request(request, { headers }))
      },
      (response) => ({
        status: statusOf(response.status),
        attributes: { 'http.response.status_code': response.status },
      }),
    )
  }

/** 現在の trace（無ければ undefined）。手でヘッダを組むとき用。 */
export const currentTraceparent = (): string | undefined => {
  const state = storage.getStore()
  return state === undefined
    ? undefined
    : formatTraceparent({
        traceId: state.traceId,
        spanId: state.currentSpanId,
        sampled: state.head.sampled,
      })
}

/**
 * 構造化ログ。常に 1 行 JSON を出し（Workers Logs）、trace_id / span_id を付ける。
 * trace が送られるときは同じ内容を OTLP logs（Loki）にも送る。
 */
export const log = (severity: Severity, message: string, attributes: Attributes = {}): void => {
  const state = storage.getStore()
  const print = state?.deps.print ?? defaultDeps.print
  const ids = state === undefined ? {} : { trace_id: state.traceId, span_id: state.currentSpanId }
  print(JSON.stringify({ level: severity, message, ...attributes, ...ids }))
  if (state === undefined) return
  state.logs.push({
    timeMs: state.deps.now(),
    severity,
    body: message,
    attributes,
    traceId: state.traceId,
    spanId: state.currentSpanId,
  })
}
