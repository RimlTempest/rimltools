import { describe, expect, test } from 'bun:test'

import { readEnvironment } from './environment.ts'

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
