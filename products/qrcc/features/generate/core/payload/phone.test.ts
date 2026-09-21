import { describe, expect, test } from 'bun:test'
import { parsePhoneNumber } from '@qrcc/contract'
import { parsePhoneInput } from './phone.ts'

describe('parsePhoneInput', () => {
  test('E.164 の番号をそのまま受け付ける', () => {
    const result = parsePhoneInput('+819012345678')
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result).toEqual({ ok: true, value: expected.value })
  })

  test('ハイフンを取り除いて検証する', () => {
    const result = parsePhoneInput('+81-90-1234-5678')
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result).toEqual({ ok: true, value: expected.value })
  })

  test('全角の数字と全角プラスを半角に直す', () => {
    const result = parsePhoneInput('＋８１９０１２３４５６７８')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result.value).toBe(expected.value)
  })

  test('空文字は不正として扱う', () => {
    const result = parsePhoneInput('')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_number')
  })

  test('国番号（+）がないと不正として扱う', () => {
    const result = parsePhoneInput('09012345678')
    expect(result.ok).toBe(false)
  })
})
