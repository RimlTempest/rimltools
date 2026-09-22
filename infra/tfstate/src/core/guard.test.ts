import { describe, expect, test } from 'bun:test'

import { checkEncryptedState } from './guard.ts'

const encrypted = JSON.stringify({
  serial: 3,
  lineage: 'f8032729-668f-1fa1-7cd3-ab2fc7a2893e',
  meta: { 'key_provider.pbkdf2.main': 'eyJ...' },
  encrypted_data: 'u7LyyeF79qY8OCgPH/Pn',
  encryption_version: 'v0',
})

describe('checkEncryptedState', () => {
  test('accepts OpenTofu-encrypted state and reads the serial', () => {
    expect(checkEncryptedState(encrypted)).toEqual({
      ok: true,
      value: { serial: 3, lineage: 'f8032729-668f-1fa1-7cd3-ab2fc7a2893e' },
    })
  })

  test('rejects plaintext state', () => {
    const plain = JSON.stringify({
      version: 4,
      terraform_version: '1.12.6',
      serial: 1,
      lineage: 'x',
      outputs: {},
      resources: [
        { type: 'cloudflare_account_token', instances: [{ attributes: { value: 't' } }] },
      ],
    })
    const result = checkEncryptedState(plain)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('not encrypted')
  })

  test('rejects encrypted-looking state that still carries plaintext keys', () => {
    const mixed = JSON.stringify({ ...JSON.parse(encrypted), resources: [] })
    expect(checkEncryptedState(mixed).ok).toBe(false)
  })

  test.each(['', 'not json', '[]', '{"encrypted_data":1,"encryption_version":"v0"}'])(
    'rejects %p',
    (body) => {
      expect(checkEncryptedState(body).ok).toBe(false)
    },
  )
})
