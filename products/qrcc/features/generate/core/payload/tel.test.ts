import { describe, expect, test } from 'bun:test'
import { parsePhoneNumber } from '@qrcc/contract'
import { buildTelPayload } from './tel.ts'

describe('buildTelPayload', () => {
  test('E.164 の番号をそのまま受け付ける', () => {
    const result = buildTelPayload('+819012345678')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result.value).toEqual({ kind: 'tel', number: expected.value })
  })

  test('ハイフンを取り除いて検証する', () => {
    const result = buildTelPayload('+81-90-1234-5678')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result.value.number).toBe(expected.value)
  })

  test('全角の数字と全角プラスを半角に直す', () => {
    const result = buildTelPayload('＋８１９０１２３４５６７８')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const expected = parsePhoneNumber('+819012345678')
    expect(expected.ok).toBe(true)
    if (expected.ok) expect(result.value.number).toBe(expected.value)
  })

  test('空文字は不正として扱う', () => {
    const result = buildTelPayload('')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_number')
  })

  test('国番号（+）がないと不正として扱う', () => {
    const result = buildTelPayload('09012345678')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_number')
  })

  test('数字以外の記号だけは不正として扱う', () => {
    const result = buildTelPayload('abc')
    expect(result.ok).toBe(false)
  })
})
