import { describe, expect, test } from 'bun:test'
import { parsePhoneNumber } from '@qrcc/contract'
import { buildSmsPayload } from './sms.ts'

describe('buildSmsPayload', () => {
  test('番号と本文から組み立てる', () => {
    const result = buildSmsPayload({ number: '+819012345678', body: 'こんにちは' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) {
      expect(result.value).toEqual({ kind: 'sms', number: expected.value, body: 'こんにちは' })
    }
  })

  test('本文は空のままにできる', () => {
    const result = buildSmsPayload({ number: '+819012345678', body: '' })
    expect(result.ok).toBe(true)
  })

  test('ハイフンを取り除いて検証する', () => {
    const result = buildSmsPayload({ number: '+81-90-1234-5678', body: '' })
    expect(result.ok).toBe(true)
  })

  test('番号が不正なら失敗する', () => {
    const result = buildSmsPayload({ number: '090-1234-5678', body: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_number')
  })
})
