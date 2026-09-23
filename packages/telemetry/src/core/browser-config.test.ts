import { describe, expect, test } from 'bun:test'

import { browserConfigFromEnv, browserMetaHtml, parseBrowserConfig } from './browser-config.ts'

describe('browserConfigFromEnv', () => {
  test('is null without FARO_URL', () => {
    expect(browserConfigFromEnv({}, 'qrcc')).toBeNull()
  })

  test('reads url, sample rate, environment and version', () => {
    expect(
      browserConfigFromEnv(
        {
          FARO_URL: 'https://faro-collector-prod-ap-northeast-0.grafana.net/collect/abc',
          FARO_SAMPLE_RATE: '0.5',
          DEPLOYMENT_ENV: 'staging',
          GIT_SHA: 'abc123',
        },
        'qrcc',
      ),
    ).toEqual({
      url: 'https://faro-collector-prod-ap-northeast-0.grafana.net/collect/abc',
      app: 'qrcc',
      environment: 'staging',
      version: 'abc123',
      sampleRate: 0.5,
    })
  })

  test('falls back to the default sample rate when invalid', () => {
    expect(
      browserConfigFromEnv({ FARO_URL: 'https://f.test/c', FARO_SAMPLE_RATE: 'x' }, 'n')
        ?.sampleRate,
    ).toBe(0.2)
  })

  test('rejects non-https collectors', () => {
    expect(browserConfigFromEnv({ FARO_URL: 'http://f.test/c' }, 'n')).toBeNull()
    expect(browserConfigFromEnv({ FARO_URL: 'http://localhost.evil.test/c' }, 'n')).toBeNull()
  })

  test('accepts the loopback collector of the local LGTM', () => {
    expect(browserConfigFromEnv({ FARO_URL: 'http://127.0.0.1:12347/collect' }, 'n')?.url).toBe(
      'http://127.0.0.1:12347/collect',
    )
  })
})

describe('browserMetaHtml / parseBrowserConfig', () => {
  const config = {
    url: 'https://f.test/collect/a"b<c',
    app: 'qrcc',
    environment: 'production',
    version: 'dev',
    sampleRate: 0.2,
  }

  test('escapes the attribute and round-trips through the parser', () => {
    const html = browserMetaHtml(config, `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`)
    expect(html).not.toContain('"b<c')
    expect(html).toContain('<meta name="traceparent" content="00-')
    const content = /name="rimltools-telemetry" content="([^"]*)"/.exec(html)?.[1] ?? ''
    const decoded = content
      .replaceAll('&quot;', '"')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')
    expect(parseBrowserConfig(decoded)).toEqual({ ok: true, value: config })
  })

  test('omits traceparent when not given', () => {
    expect(browserMetaHtml(config, undefined)).not.toContain('traceparent')
  })

  test('parseBrowserConfig rejects garbage', () => {
    expect(parseBrowserConfig('{').ok).toBe(false)
    expect(parseBrowserConfig('{"url":1}').ok).toBe(false)
    expect(parseBrowserConfig(null)).toEqual({ ok: true, value: null })
  })
})
