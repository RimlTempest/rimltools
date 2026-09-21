import { describe, expect, test } from 'bun:test'

import { instrument, log, traced, withSpan, type WorkerDeps } from './index.ts'

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'

type Sent = { url: string; body: unknown; headers: Headers }

const setup = (overrides: Partial<WorkerDeps> = {}) => {
  const sent: Sent[] = []
  const lines: string[] = []
  let clock = 1_000
  let id = 0
  const deps: WorkerDeps = {
    fetch: async (input, init) => {
      const request = new Request(input, init)
      sent.push({ url: request.url, body: await request.json(), headers: request.headers })
      return new Response(null, { status: 200 })
    },
    now: () => clock,
    random: () => 0.99,
    fillRandom: (bytes) => {
      id += 1
      bytes.fill(id)
      return bytes
    },
    print: (line) => lines.push(line),
    ...overrides,
  }
  const waits: Promise<unknown>[] = []
  const ctx = { waitUntil: (promise: Promise<unknown>) => void waits.push(promise) }
  const tick = (ms: number) => {
    clock += ms
  }
  const flush = () => Promise.all(waits)
  return { deps, sent, lines, ctx, tick, flush }
}

const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example/otlp',
  OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20abc',
  DEPLOYMENT_ENV: 'staging',
  OTEL_SLOW_MS: '500',
}

const spansOf = (sent: Sent[]) => {
  const traces = sent.find((s) => s.url.endsWith('/v1/traces'))
  return JSON.stringify(traces?.body ?? {})
}

describe('instrument', () => {
  test('is a no-op without an endpoint', async () => {
    const t = setup()
    const handler = instrument(async () => new Response('ok'), { serviceName: 'qrcc-web' }, t.deps)
    const response = await handler(new Request('https://qrcc.test/'), {}, t.ctx)
    await t.flush()
    expect(await response.text()).toBe('ok')
    expect(t.sent).toEqual([])
  })

  test('drops fast successful requests that are not head-sampled', async () => {
    const t = setup()
    const handler = instrument(async () => new Response('ok'), { serviceName: 'qrcc-web' }, t.deps)
    await handler(new Request('https://qrcc.test/'), env, t.ctx)
    await t.flush()
    expect(t.sent).toEqual([])
  })

  test('exports 5xx with the root span, auth header and resource', async () => {
    const t = setup()
    const handler = instrument(
      async () => {
        t.tick(20)
        return new Response('down', { status: 503 })
      },
      { serviceName: 'qrcc-web', route: () => '/generate' },
      t.deps,
    )
    await handler(
      new Request('https://qrcc.test/generate?secret=1', { method: 'POST' }),
      env,
      t.ctx,
    )
    await t.flush()
    expect(t.sent).toHaveLength(1)
    const [traces] = t.sent
    expect(traces?.url).toBe('https://otlp.example/otlp/v1/traces')
    expect(traces?.headers.get('authorization')).toBe('Basic abc')
    const body = spansOf(t.sent)
    expect(body).toContain('"stringValue":"qrcc-web"')
    expect(body).toContain('"key":"http.response.status_code","value":{"intValue":"503"}')
    expect(body).toContain('"key":"http.route","value":{"stringValue":"/generate"}')
    expect(body).toContain('"key":"sampling.reason","value":{"stringValue":"error"}')
    expect(body).toContain('"name":"POST /generate"')
    // クエリ文字列は送らない
    expect(body).not.toContain('secret')
  })

  test('continues the upstream trace and respects its sampled flag', async () => {
    const t = setup()
    const handler = instrument(async () => new Response('ok'), { serviceName: 'x' }, t.deps)
    const request = new Request('https://qrcc.test/', {
      headers: { traceparent: `00-${TRACE}-00f067aa0ba902b7-01` },
    })
    await handler(request, env, t.ctx)
    await t.flush()
    const body = spansOf(t.sent)
    expect(body).toContain(`"traceId":"${TRACE}"`)
    expect(body).toContain('"parentSpanId":"00f067aa0ba902b7"')
    expect(body).toContain('"key":"sampling.reason","value":{"stringValue":"parent"}')
  })

  test('exports slow requests', async () => {
    const t = setup()
    const handler = instrument(
      async () => {
        t.tick(600)
        return new Response('ok')
      },
      { serviceName: 'x' },
      t.deps,
    )
    await handler(new Request('https://qrcc.test/'), env, t.ctx)
    await t.flush()
    expect(spansOf(t.sent)).toContain('"stringValue":"slow"')
  })

  test('records exceptions, exports them and rethrows', async () => {
    const t = setup()
    const handler = instrument(
      async () => Promise.reject(new TypeError('kaboom')),
      { serviceName: 'x' },
      t.deps,
    )
    const outcome = await handler(new Request('https://qrcc.test/'), env, t.ctx).then(
      () => 'resolved',
      (error: unknown) => (error instanceof TypeError ? error.message : 'other'),
    )
    await t.flush()
    expect(outcome).toBe('kaboom')
    const body = spansOf(t.sent)
    expect(body).toContain('"name":"exception"')
    expect(body).toContain('"stringValue":"TypeError"')
    expect(body).toContain('"code":2')
  })

  test('child spans propagate traceparent to service bindings', async () => {
    const t = setup({ random: () => 0 })
    let forwarded: string | null = null
    const api = traced('qrcc-api', async (request: Request) => {
      forwarded = request.headers.get('traceparent')
      return new Response('{}', { status: 200 })
    })
    const handler = instrument(
      async () => {
        await api(new Request('https://qrcc-api.internal/rpc/render', { method: 'POST' }))
        return new Response('ok')
      },
      { serviceName: 'qrcc-web' },
      t.deps,
    )
    await handler(new Request('https://qrcc.test/'), env, t.ctx)
    await t.flush()
    expect(forwarded).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    const body = spansOf(t.sent)
    expect(body).toContain('"name":"qrcc-api POST /rpc/render"')
    expect(body).toContain('"kind":3')
  })

  test('traced() and withSpan() pass through outside a request', async () => {
    const api = traced('qrcc-api', async () => new Response('x'))
    expect(await (await api(new Request('https://a.test/'))).text()).toBe('x')
    expect(await withSpan('d1 query', async () => 42)).toBe(42)
  })

  test('logs carry trace ids to stdout and to OTLP logs when exported', async () => {
    const t = setup()
    const handler = instrument(
      async () => {
        log('error', 'render failed', { 'rpc.method': 'render' })
        return new Response('x', { status: 500 })
      },
      { serviceName: 'x' },
      t.deps,
    )
    await handler(new Request('https://qrcc.test/'), env, t.ctx)
    await t.flush()
    const line = JSON.parse(t.lines.find((l) => l.includes('render failed')) ?? '{}')
    expect(line).toMatchObject({ level: 'error', message: 'render failed', 'rpc.method': 'render' })
    expect(line.trace_id).toMatch(/^[0-9a-f]{32}$/)
    expect(line.span_id).toMatch(/^[0-9a-f]{16}$/)
    const logs = t.sent.find((s) => s.url.endsWith('/v1/logs'))
    expect(JSON.stringify(logs?.body)).toContain(`"traceId":"${line.trace_id}"`)
  })

  test('an exporter failure never breaks the response', async () => {
    const t = setup({ fetch: async () => Promise.reject(new Error('network down')) })
    const handler = instrument(
      async () => new Response('x', { status: 500 }),
      { serviceName: 'x' },
      t.deps,
    )
    const response = await handler(new Request('https://qrcc.test/'), env, t.ctx)
    await t.flush()
    expect(response.status).toBe(500)
    expect(t.lines.some((l) => l.includes('telemetry export failed'))).toBe(true)
  })

  test('an invalid config disables telemetry with one error line', async () => {
    const t = setup()
    const handler = instrument(async () => new Response('ok'), { serviceName: 'x' }, t.deps)
    const bad = { ...env, OTEL_TRACES_SAMPLER_ARG: 'lots' }
    await handler(new Request('https://qrcc.test/'), bad, t.ctx)
    await handler(new Request('https://qrcc.test/'), bad, t.ctx)
    expect(t.lines.filter((l) => l.includes('OTEL_TRACES_SAMPLER_ARG'))).toHaveLength(1)
    expect(t.sent).toEqual([])
  })
})
