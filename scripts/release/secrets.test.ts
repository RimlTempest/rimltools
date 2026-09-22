import { describe, expect, test } from 'bun:test'

import { versionSecrets } from './secrets.ts'

const publicConfig = {
  name: 'qrcc-web-staging',
  vars: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example/otlp' },
}
const internalConfig = { name: 'qrcc-api-staging' }

const appSecrets = JSON.stringify({
  qrcc: { BETTER_AUTH_SECRET: 'b', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' },
  noter: { BETTER_AUTH_SECRET: 'n' },
})

const base = {
  env: 'staging' as const,
  tool: 'qrcc',
  publicWorkerName: 'qrcc-web-staging',
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

  test("attaches the tool's app secrets to the public worker only", () => {
    const pub = versionSecrets({ ...base, config: publicConfig, appSecretsJson: appSecrets })
    expect(pub).toEqual({
      ok: true,
      value: { BETTER_AUTH_SECRET: 'b', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' },
    })
    const internal = versionSecrets({ ...base, config: internalConfig, appSecretsJson: appSecrets })
    expect(internal).toEqual({ ok: true, value: {} })
  })

  test('merges app secrets with the OTLP headers', () => {
    const result = versionSecrets({
      ...base,
      tool: 'noter',
      publicWorkerName: 'noter-web-staging',
      config: { ...publicConfig, name: 'noter-web-staging' },
      otlpHeaders: 'h',
      appSecretsJson: appSecrets,
    })
    expect(result).toEqual({
      ok: true,
      value: { OTEL_EXPORTER_OTLP_HEADERS: 'h', BETTER_AUTH_SECRET: 'n' },
    })
  })

  test('ignores tools that are not in APP_SECRETS', () => {
    const result = versionSecrets({
      ...base,
      tool: 'portal',
      publicWorkerName: 'rimltools-portal-staging',
      config: { name: 'rimltools-portal-staging' },
      appSecretsJson: appSecrets,
    })
    expect(result).toEqual({ ok: true, value: {} })
  })

  test('refuses APP_SECRETS in production so existing secrets are never overwritten', () => {
    const result = versionSecrets({
      ...base,
      env: 'production',
      publicWorkerName: 'qrcc-web',
      config: { ...publicConfig, name: 'qrcc-web' },
      appSecretsJson: appSecrets,
    })
    expect(result.ok).toBe(false)
  })

  test.each([
    ['not json', 'not JSON'],
    ['[]', 'object'],
    [JSON.stringify({ qrcc: 'x' }), 'object'],
    [JSON.stringify({ qrcc: { lower_case: 'x' } }), 'name'],
    [JSON.stringify({ qrcc: { GOOD: 1 } }), 'string'],
    [JSON.stringify({ qrcc: { GOOD: '' } }), 'empty'],
    [JSON.stringify({ qrcc: { OTEL_EXPORTER_OTLP_HEADERS: 'x' } }), 'reserved'],
  ])('rejects a malformed APP_SECRETS (%s)', (raw, reason) => {
    const result = versionSecrets({ ...base, config: publicConfig, appSecretsJson: raw })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(reason)
  })

  test('never puts a secret value into an error message', () => {
    const raw = JSON.stringify({ qrcc: { GOOD: 'super-secret-value', bad: 'super-secret-value' } })
    const result = versionSecrets({ ...base, config: publicConfig, appSecretsJson: raw })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).not.toContain('super-secret-value')
  })
})
