import { describe, expect, test } from 'bun:test'

import { rewriteConfig } from './rewrite.ts'
import { noter, qrcc } from './fixtures.ts'

const webConfig = {
  name: 'qrcc-web',
  main: 'index.js',
  routes: [{ pattern: 'qrcc.riml4i.com', custom_domain: true }],
  workers_dev: false,
  vars: { APP_ORIGIN: 'https://qrcc.riml4i.com', OTHER: 'x' },
  d1_databases: [{ binding: 'DB', database_name: 'qrcc', database_id: 'prod-id' }],
  services: [
    { binding: 'API', service: 'qrcc-api' },
    { binding: 'EXT', service: 'someone-else' },
  ],
  durable_objects: { bindings: [] },
}

const staging = { name: 'staging', suffix: '-staging', d1Id: () => 'stg-id' } as const

describe('rewriteConfig', () => {
  test('renames the worker and its tool-internal references for staging', () => {
    const result = rewriteConfig(webConfig, { tool: qrcc, env: staging, host: 'qrcc-staging.t' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const out = result.value
    expect(out['name']).toBe('qrcc-web-staging')
    expect(out['routes']).toBeUndefined()
    expect(out['d1_databases']).toEqual([
      { binding: 'DB', database_name: 'qrcc-staging', database_id: 'stg-id' },
    ])
    expect(out['services']).toEqual([
      { binding: 'API', service: 'qrcc-api-staging' },
      { binding: 'EXT', service: 'someone-else' },
    ])
    // staging には旧ホストが無い
    expect(out['vars']).toEqual({
      APP_ORIGIN: 'https://qrcc-staging.t',
      APP_LEGACY_ORIGINS: '',
      OTHER: 'x',
    })
    expect(out['workers_dev']).toBe(false)
    // staging の public Worker だけ preview URL を開く（PR プレビュー用）
    expect(out['preview_urls']).toBe(true)
  })

  test('keeps production names but still strips routes and closes preview URLs', () => {
    const production = { name: 'production', suffix: '', d1Id: () => 'prod-id' } as const
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
    })
  })

  test('never opens preview URLs on an internal worker (ADR-0002)', () => {
    const api = { name: 'qrcc-api', workers_dev: false, d1_databases: [] }
    const result = rewriteConfig(api, { tool: qrcc, env: staging, host: 'h' })
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
    const result = rewriteConfig(web, { tool: noter, env: staging, host: 'h' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['durable_objects']).toEqual({
      bindings: [{ name: 'ROOM', class_name: 'DocumentRoom', script_name: 'noter-sync-staging' }],
    })
  })

  test('fails when the D1 id for the environment is unknown', () => {
    const env = { name: 'staging', suffix: '-staging', d1Id: () => undefined } as const
    const result = rewriteConfig(webConfig, { tool: qrcc, env, host: 'h' })
    expect(result.ok).toBe(false)
  })

  test('fails when the config names a worker the tool does not own', () => {
    const result = rewriteConfig({ name: 'other' }, { tool: qrcc, env: staging, host: 'h' })
    expect(result.ok).toBe(false)
  })
})
