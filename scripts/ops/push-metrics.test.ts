import { describe, expect, test } from 'bun:test'

import { readConfig, run, type Deps } from './push-metrics.ts'

const env = {
  CLOUDFLARE_ANALYTICS_TOKEN: 'cf',
  CLOUDFLARE_ACCOUNT_ID: 'acc',
  GRAFANA_METRICS_PUSH_URL: 'https://otlp.example/otlp/',
  GRAFANA_METRICS_PUSH_USER: '123',
  GRAFANA_METRICS_PUSH_TOKEN: 'tok',
}

type Call = { url: string; body: string; headers: Record<string, string> }

const fakeDeps = (
  respond: (call: Call) => Response,
): { deps: Deps; calls: Call[]; logs: string[] } => {
  const calls: Call[] = []
  const logs: string[] = []
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers)
    const call = {
      url: input instanceof Request ? input.url : input.toString(),
      body: typeof init?.body === 'string' ? init.body : '',
      headers: Object.fromEntries(headers.entries()),
    }
    calls.push(call)
    return respond(call)
  }
  return {
    deps: {
      fetch: Object.assign(fakeFetch, { preconnect: () => undefined }),
      now: () => new Date('2026-09-22T10:17:30Z'),
      env,
      log: (m) => logs.push(m),
    },
    calls,
    logs,
  }
}

const workers = (withVersion: boolean) =>
  Response.json({
    data: {
      viewer: {
        accounts: [
          {
            workersInvocationsAdaptive: [
              {
                sum: { requests: 10, errors: 1, subrequests: 0 },
                quantiles: { cpuTimeP50: 1, cpuTimeP99: 5 },
                dimensions: {
                  scriptName: 'qrcc-web',
                  status: 'success',
                  ...(withVersion ? { scriptVersion: 'v1' } : {}),
                },
              },
            ],
          },
        ],
      },
    },
  })

const d1 = () =>
  Response.json({
    data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [] }] } },
  })

describe('readConfig', () => {
  test('lists the missing variables', () => {
    const result = readConfig({ CLOUDFLARE_ACCOUNT_ID: 'x' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('GRAFANA_METRICS_PUSH_TOKEN')
  })
})

describe('run', () => {
  test('skips quietly when credentials are not registered yet', async () => {
    const { deps, calls } = fakeDeps(() => new Response('unexpected', { status: 500 }))
    expect(await run({ ...deps, env: {} }, false)).toBe(0)
    expect(calls).toEqual([])
  })

  test('falls back to the documented fields when the extended ones are rejected', async () => {
    const { deps, calls, logs } = fakeDeps((call) => {
      if (call.url.endsWith('/v1/metrics')) return new Response('', { status: 200 })
      if (call.body.includes('d1AnalyticsAdaptiveGroups')) return d1()
      if (call.body.includes('scriptVersion')) {
        return Response.json({ errors: [{ message: 'unknown field "scriptVersion"' }] })
      }
      return workers(false)
    })
    expect(await run(deps, false)).toBe(0)
    expect(logs.some((l) => l.includes('using the basic set'))).toBe(true)

    const pushCall = calls.find((c) => c.url === 'https://otlp.example/otlp/v1/metrics')
    expect(pushCall?.headers['authorization']).toBe(`Basic ${btoa('123:tok')}`)
    const names: unknown = JSON.parse(pushCall?.body ?? '{}')
    expect(JSON.stringify(names)).toContain('rimltools_worker_requests')
    expect(JSON.stringify(names)).toContain('rimltools_metrics_push_last_success_timestamp_seconds')
  })

  test('treats duplicate-sample rejections as success (windows are re-sent on purpose)', async () => {
    const { deps } = fakeDeps((call) => {
      if (call.url.endsWith('/v1/metrics')) {
        return new Response('err-mimir-sample-duplicate-timestamp', { status: 400 })
      }
      if (call.body.includes('d1AnalyticsAdaptiveGroups')) return d1()
      return workers(true)
    })
    expect(await run(deps, false)).toBe(0)
  })

  test('fails on other push errors', async () => {
    const { deps } = fakeDeps((call) => {
      if (call.url.endsWith('/v1/metrics')) return new Response('unauthorized', { status: 401 })
      if (call.body.includes('d1AnalyticsAdaptiveGroups')) return d1()
      return workers(true)
    })
    expect(await run(deps, false)).toBe(1)
  })
})
