import { describe, expect, test } from 'bun:test'

import { parseHeaders, readConfig } from './config.ts'

describe('parseHeaders (OTEL_EXPORTER_OTLP_HEADERS)', () => {
  test('parses comma separated key=value pairs with percent-encoding', () => {
    expect(parseHeaders('Authorization=Basic%20abc%3D%3D,x-scope=a')).toEqual({
      Authorization: 'Basic abc==',
      'x-scope': 'a',
    })
  })

  test('keeps "=" inside values and trims spaces', () => {
    expect(parseHeaders(' Authorization = Basic abc== ')).toEqual({ Authorization: 'Basic abc==' })
  })

  test('ignores malformed entries', () => {
    expect(parseHeaders('novalue,=x,,ok=1')).toEqual({ ok: '1' })
  })
})

describe('readConfig', () => {
  const env = {
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp/',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20x',
    OTEL_SERVICE_NAME: 'qrcc-web',
    DEPLOYMENT_ENV: 'staging',
    GIT_SHA: 'abc123',
  }

  test('is disabled (null) without an endpoint', () => {
    expect(readConfig({}, { serviceName: 'qrcc-web' })).toEqual({ ok: true, value: null })
    expect(readConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: '' }, { serviceName: 'x' }).ok).toBe(true)
  })

  test('reads endpoint, headers and defaults', () => {
    const result = readConfig(env, { serviceName: 'fallback' })
    expect(result.ok).toBe(true)
    if (!result.ok || result.value === null) return
    expect(result.value).toMatchObject({
      tracesUrl: 'https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp/v1/traces',
      logsUrl: 'https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp/v1/logs',
      headers: { Authorization: 'Basic x' },
      ratio: 0.1,
      slowMs: 1000,
      resource: {
        'service.name': 'qrcc-web',
        'service.namespace': 'rimltools',
        'service.version': 'abc123',
        'deployment.environment.name': 'staging',
      },
    })
  })

  test('uses the worker version metadata when present', () => {
    const result = readConfig(
      { ...env, CF_VERSION_METADATA: { id: 'v-1', tag: 't', timestamp: 'ts' } },
      { serviceName: 'x' },
    )
    expect(result.ok && result.value?.resource['cloudflare.worker.version_id']).toBe('v-1')
  })

  test('rejects an invalid ratio or slow threshold', () => {
    expect(readConfig({ ...env, OTEL_TRACES_SAMPLER_ARG: '2' }, { serviceName: 'x' }).ok).toBe(
      false,
    )
    expect(readConfig({ ...env, OTEL_SLOW_MS: '-1' }, { serviceName: 'x' }).ok).toBe(false)
  })

  test('rejects a non-https endpoint', () => {
    const result = readConfig(
      { ...env, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector' },
      { serviceName: 'x' },
    )
    expect(result.ok).toBe(false)
  })
})
