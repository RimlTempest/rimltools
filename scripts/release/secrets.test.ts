import { describe, expect, test } from 'bun:test'

import { versionSecrets } from './secrets.ts'

const publicConfig = {
  name: 'qrcc-web',
  vars: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example/otlp' },
}
const internalConfig = { name: 'qrcc-api' }

const base = {
  tool: 'qrcc',
  otlpHeaders: '',
  appSecretsJson: '',
}

describe('versionSecrets', () => {
  test('returns nothing when there is nothing to attach', () => {
    expect(versionSecrets({ ...base, config: publicConfig })).toEqual({ ok: true, value: {} })
  })

  test('attaches the OTLP headers only when the worker has an endpoint', () => {
    const withEndpoint = versionSecrets({
      ...base,
      config: publicConfig,
      otlpHeaders: 'Authorization=Basic%20x',
    })
    expect(withEndpoint).toEqual({
      ok: true,
      value: { OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20x' },
    })
    const withoutEndpoint = versionSecrets({
      ...base,
      config: internalConfig,
      otlpHeaders: 'Authorization=Basic%20x',
    })
    expect(withoutEndpoint).toEqual({ ok: true, value: {} })
  })

  test('refuses APP_SECRETS at all (staging / preview を廃止したので書く環境が無い)', () => {
    const result = versionSecrets({
      ...base,
      config: publicConfig,
      appSecretsJson: JSON.stringify({ qrcc: { BETTER_AUTH_SECRET: 'super-secret-value' } }),
    })
    expect(result.ok).toBe(false)
    // エラー文字列に値を入れない
    if (!result.ok) expect(result.error).not.toContain('super-secret-value')
  })
})
