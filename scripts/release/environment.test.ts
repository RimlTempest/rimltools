import { describe, expect, test } from 'bun:test'

import { accessHeaders, mergeVariables, readEnvironment } from './environment.ts'

const base = {
  RIMLTOOLS_ENV: 'staging',
  BASE_DOMAIN: 'tools.example.com',
  CF_ZONE_ID: 'zone',
  WORKER_SUFFIX: '-staging',
  CLOUDFLARE_ACCOUNT_ID: 'acc',
  CLOUDFLARE_API_TOKEN: 'tok',
  D1_QRCC_ID: 'id-q',
  D1_NOTER_ID: 'id-n',
}

describe('readEnvironment', () => {
  test('reads the environment contract set by Terraform', () => {
    const result = readEnvironment(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('staging')
    expect(result.value.suffix).toBe('-staging')
    expect(result.value.d1Id('qrcc')).toBe('id-q')
    expect(result.value.d1Id('missing')).toBeUndefined()
  })

  test('production has an empty suffix', () => {
    const result = readEnvironment({ ...base, RIMLTOOLS_ENV: 'production', WORKER_SUFFIX: '' })
    expect(result.ok && result.value.suffix).toBe('')
  })

  test('rejects an unknown environment and lists every missing variable', () => {
    const result = readEnvironment({ RIMLTOOLS_ENV: 'prod' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('RIMLTOOLS_ENV')
    expect(result.error).toContain('CLOUDFLARE_API_TOKEN')
    expect(result.error).toContain('BASE_DOMAIN')
  })

  test('production must not carry a suffix and staging must', () => {
    expect(readEnvironment({ ...base, RIMLTOOLS_ENV: 'production' }).ok).toBe(false)
    expect(readEnvironment({ ...base, WORKER_SUFFIX: '' }).ok).toBe(false)
  })
})

describe('mergeVariables', () => {
  test('lets real environment variables win over the vars JSON', () => {
    const merged = mergeVariables('{"D1_QRCC_ID":"from-vars","BASE_DOMAIN":"v"}', {
      BASE_DOMAIN: 'env',
    })
    expect(merged['D1_QRCC_ID']).toBe('from-vars')
    expect(merged['BASE_DOMAIN']).toBe('env')
  })

  test('ignores a missing or malformed vars JSON', () => {
    expect(mergeVariables(undefined, { A: '1' })).toEqual({ A: '1' })
    expect(mergeVariables('not json', { A: '1' })).toEqual({ A: '1' })
  })
})

describe('accessHeaders', () => {
  test('adds the Cloudflare Access service token when both halves are present', () => {
    expect(accessHeaders({ CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_CLIENT_SECRET: 's' })).toEqual({
      'CF-Access-Client-Id': 'id',
      'CF-Access-Client-Secret': 's',
    })
    expect(accessHeaders({ CF_ACCESS_CLIENT_ID: 'id' })).toEqual({})
  })
})

describe('production without WORKER_SUFFIX', () => {
  test('treats an undefined suffix as empty (GitHub variables cannot be empty)', () => {
    const { WORKER_SUFFIX: _dropped, ...rest } = base
    const result = readEnvironment({ ...rest, RIMLTOOLS_ENV: 'production' })
    expect(result.ok && result.value.suffix).toBe('')
  })
})
