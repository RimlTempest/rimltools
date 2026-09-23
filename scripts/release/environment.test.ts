import { describe, expect, test } from 'bun:test'

import { accessHeaders, readEnvironment, readReleaseConfig } from './environment.ts'

const base = {
  RIMLTOOLS_ENV: 'production',
  BASE_DOMAIN: 'tools.example.com',
  CF_ZONE_ID: 'zone',
  WORKER_SUFFIX: '',
  CLOUDFLARE_ACCOUNT_ID: 'acc',
  D1_QRCC_ID: 'id-q',
  D1_NOTER_ID: 'id-n',
}

describe('readReleaseConfig', () => {
  test('keeps only allow-listed keys and D1 ids', () => {
    const config = readReleaseConfig({
      varsJson: '{"D1_QRCC_ID":"from-vars","BASE_DOMAIN":"v","SOMETHING_ELSE":"x"}',
      values: { BASE_DOMAIN: 'env', GITHUB_SHA: 'abc', PATH: '/bin' },
    })
    expect(config['D1_QRCC_ID']).toBe('from-vars')
    expect(config['BASE_DOMAIN']).toBe('env')
    expect(config['GITHUB_SHA']).toBe('abc')
    expect(config['SOMETHING_ELSE']).toBeUndefined()
    expect(config['PATH']).toBeUndefined()
  })

  test('never carries credentials, even when they are handed in', () => {
    const config = readReleaseConfig({
      varsJson: '{"CLOUDFLARE_API_TOKEN":"leak","CF_ACCESS_CLIENT_SECRET":"leak"}',
      values: { CLOUDFLARE_API_TOKEN: 'leak', CF_ACCESS_CLIENT_SECRET: 'leak', GH_TOKEN: 'leak' },
    })
    expect(Object.values(config)).not.toContain('leak')
  })

  test('reads the telemetry settings from the environment vars', () => {
    const config = readReleaseConfig({
      varsJson:
        '{"GRAFANA_OTLP_ENDPOINT":"https://o","FARO_URL_QRCC":"https://f","GRAFANA_OTLP_HEADERS":"leak"}',
      values: {},
    })
    expect(config['GRAFANA_OTLP_ENDPOINT']).toBe('https://o')
    expect(config['FARO_URL_QRCC']).toBe('https://f')
    // ヘッダは secret なので設定には入れない
    expect(config['GRAFANA_OTLP_HEADERS']).toBeUndefined()
  })

  test('ignores a missing or malformed vars JSON', () => {
    expect(readReleaseConfig({ varsJson: undefined, values: { GITHUB_SHA: 'a' } })).toEqual({
      GITHUB_SHA: 'a',
    })
    expect(readReleaseConfig({ varsJson: 'not json', values: {} })).toEqual({})
  })
})

describe('readEnvironment', () => {
  test('reads the environment contract set by Terraform', () => {
    const result = readEnvironment(base, { hasApiToken: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('production')
    expect(result.value.suffix).toBe('')
    expect(result.value.d1Id('qrcc')).toBe('id-q')
    expect(result.value.d1Id('missing')).toBeUndefined()
    // 実行時の設定に資格情報を持たない
    expect(JSON.stringify(result.value)).not.toContain('tok')
  })

  test('production has an empty suffix', () => {
    const result = readEnvironment(base, { hasApiToken: true })
    expect(result.ok && result.value.suffix).toBe('')
  })

  test('rejects an unknown environment and lists every missing variable', () => {
    const result = readEnvironment({ RIMLTOOLS_ENV: 'prod' }, { hasApiToken: false })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('RIMLTOOLS_ENV')
    expect(result.error).toContain('CLOUDFLARE_API_TOKEN')
    expect(result.error).toContain('BASE_DOMAIN')
  })

  test('production must not carry a suffix', () => {
    // staging / preview を廃止したので、接尾辞の付いた Worker はもう無い
    expect(readEnvironment({ ...base, WORKER_SUFFIX: '-staging' }, { hasApiToken: true }).ok).toBe(
      false,
    )
  })
})

describe('production without WORKER_SUFFIX', () => {
  test('treats an undefined suffix as empty (GitHub variables cannot be empty)', () => {
    const { WORKER_SUFFIX: _dropped, ...rest } = base
    const result = readEnvironment(rest, { hasApiToken: true })
    expect(result.ok && result.value.suffix).toBe('')
  })
})

describe('accessHeaders', () => {
  test('adds the Cloudflare Access service token when both halves are present', () => {
    expect(accessHeaders('id', 's')).toEqual({
      'CF-Access-Client-Id': 'id',
      'CF-Access-Client-Secret': 's',
    })
    expect(accessHeaders('id', undefined)).toEqual({})
  })
})
