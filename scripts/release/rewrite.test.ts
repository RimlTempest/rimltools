import { describe, expect, test } from 'bun:test'

import { needsOtlpSecret, parseJsonc, rewriteConfig } from './rewrite.ts'
import { noter, portal, qrcc } from './fixtures.ts'

const production = { name: 'production', suffix: '', d1Id: () => 'prod-id' } as const

const webConfig = {
  name: 'qrcc-web',
  main: 'index.js',
  routes: [{ pattern: 'qrcc.riml4i.com', custom_domain: true }],
  workers_dev: false,
  vars: {
    APP_ORIGIN: 'https://qrcc.riml4i.com',
    OTHER: 'x',
    OTEL_SERVICE_NAME: 'qrcc-web',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    FARO_URL: '',
  },
  version_metadata: { binding: 'CF_VERSION_METADATA' },
  d1_databases: [{ binding: 'DB', database_name: 'qrcc', database_id: 'prod-id' }],
  services: [
    { binding: 'API', service: 'qrcc-api' },
    { binding: 'EXT', service: 'someone-else' },
  ],
  durable_objects: { bindings: [] },
}

describe('rewriteConfig', () => {
  test('keeps production names but still strips routes and closes preview URLs', () => {
    const result = rewriteConfig(webConfig, { tool: qrcc, env: production, host: 'qrcc.t' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['name']).toBe('qrcc-web')
    expect(result.value['routes']).toBeUndefined()
    expect(result.value['preview_urls']).toBe(false)
    // ドメイン移行中は旧ホストでもログインできるよう、アプリに旧オリジンを渡す
    expect(result.value['vars']).toEqual({
      APP_ORIGIN: 'https://qrcc.t',
      APP_LEGACY_ORIGINS: 'https://qrcc.example.com',
      OTHER: 'x',
      OTEL_SERVICE_NAME: 'qrcc-web',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      FARO_URL: '',
      DEPLOYMENT_ENV: 'production',
      GIT_SHA: 'local',
    })
  })

  test('never opens preview URLs on an internal worker (ADR-0002)', () => {
    const api = { name: 'qrcc-api', workers_dev: false, d1_databases: [] }
    const result = rewriteConfig(api, { tool: qrcc, env: production, host: 'h' })
    expect(result.ok && result.value['preview_urls']).toBe(false)
  })

  test('suffixes the Durable Object script_name', () => {
    const web = {
      name: 'noter-web',
      durable_objects: {
        bindings: [{ name: 'ROOM', class_name: 'DocumentRoom', script_name: 'noter-sync' }],
      },
      d1_databases: [{ binding: 'DB', database_name: 'noter', database_id: 'p' }],
    }
    const result = rewriteConfig(web, { tool: noter, env: production, host: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['durable_objects']).toEqual({
      bindings: [{ name: 'ROOM', class_name: 'DocumentRoom', script_name: 'noter-sync' }],
    })
  })

  test('fails when the D1 id for the environment is unknown', () => {
    const env = { name: 'production', suffix: '', d1Id: () => undefined } as const
    const result = rewriteConfig(webConfig, { tool: qrcc, env, host: 'h' })
    expect(result.ok).toBe(false)
  })

  test('fails when the config names a worker the tool does not own', () => {
    const result = rewriteConfig({ name: 'other' }, { tool: qrcc, env: production, host: 'h' })
    expect(result.ok).toBe(false)
  })

  test('refuses configs that switch off invocation logs (canary analytics depend on them)', () => {
    for (const observability of [
      { enabled: false },
      { enabled: true, logs: { invocation_logs: false } },
    ]) {
      const result = rewriteConfig(
        { ...webConfig, observability },
        { tool: qrcc, env: production, host: 'h' },
      )
      expect(result.ok).toBe(false)
    }
    const enabled = rewriteConfig(
      { ...webConfig, observability: { enabled: true } },
      { tool: qrcc, env: production, host: 'h' },
    )
    expect(enabled.ok).toBe(true)
  })

  test('handles an assets-only worker without D1, services or vars (portal)', () => {
    const config = {
      name: 'rimltools-portal',
      compatibility_date: '2026-09-22',
      workers_dev: false,
      preview_urls: false,
      assets: { directory: './dist', not_found_handling: '404-page' },
    }
    const result = rewriteConfig(config, { tool: portal, env: production, host: 'portal.t' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['name']).toBe('rimltools-portal')
    expect(result.value['assets']).toEqual(config.assets)
    expect(result.value['d1_databases']).toBeUndefined()
    expect(result.value['services']).toBeUndefined()
    expect(result.value['vars']).toBeUndefined()
    // 設定で明示的に閉じている preview URL は開かない
    expect(result.value['preview_urls']).toBe(false)
  })
})

describe('parseJsonc', () => {
  test('reads wrangler.jsonc with comments and trailing commas', () => {
    const text = `{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  // line comment with "quotes" and a // inside
  "name": "rimltools-portal", /* block */
  "url": "https://example.com/a//b",
  "assets": { "directory": "./dist", },
}`
    expect(parseJsonc(text)).toEqual({
      ok: true,
      value: {
        $schema: '../../node_modules/wrangler/config-schema.json',
        name: 'rimltools-portal',
        url: 'https://example.com/a//b',
        assets: { directory: './dist' },
      },
    })
  })

  test('reports broken input', () => {
    expect(parseJsonc('{ "a": ').ok).toBe(false)
  })

  test('fills telemetry vars for workers that declare them (docs/ops/telemetry.md)', () => {
    const result = rewriteConfig(webConfig, {
      tool: qrcc,
      env: production,
      host: 'h',
      telemetry: {
        otlpEndpoint: 'https://otlp.example/otlp',
        faroUrl: 'https://faro.example/collect',
        gitSha: 'abc123',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['vars']).toMatchObject({
      OTEL_SERVICE_NAME: 'qrcc-web',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example/otlp',
      FARO_URL: 'https://faro.example/collect',
      DEPLOYMENT_ENV: 'production',
      GIT_SHA: 'abc123',
    })
  })

  test('does not add telemetry vars to workers that do not use telemetry', () => {
    const api = { name: 'qrcc-api', vars: {} }
    const result = rewriteConfig(api, {
      tool: qrcc,
      env: production,
      host: 'h',
      telemetry: { otlpEndpoint: 'https://otlp.example/otlp', faroUrl: undefined, gitSha: 'abc' },
    })
    expect(result.ok && result.value['vars']).toEqual({})
  })
})

describe('needsOtlpSecret', () => {
  test('only when the prepared config exports to an OTLP endpoint', () => {
    expect(needsOtlpSecret({ vars: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://o' } })).toBe(true)
    expect(needsOtlpSecret({ vars: { OTEL_EXPORTER_OTLP_ENDPOINT: '' } })).toBe(false)
    expect(needsOtlpSecret({ vars: {} })).toBe(false)
    expect(needsOtlpSecret({})).toBe(false)
  })
})
