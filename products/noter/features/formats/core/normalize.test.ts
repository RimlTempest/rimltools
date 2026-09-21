import { describe, expect, test } from 'bun:test'
import { toJsonValue } from './normalize.ts'

describe('toJsonValue', () => {
  test('スカラーはそのまま通す', () => {
    expect(toJsonValue(null)).toEqual({ ok: true, value: null })
    expect(toJsonValue(true)).toEqual({ ok: true, value: true })
    expect(toJsonValue('a')).toEqual({ ok: true, value: 'a' })
    expect(toJsonValue(1.5)).toEqual({ ok: true, value: 1.5 })
  })

  test('入れ子の配列とオブジェクトを再帰的に通す', () => {
    const input = { a: [1, { b: 'x' }], c: null }
    expect(toJsonValue(input)).toEqual({ ok: true, value: { a: [1, { b: 'x' }], c: null } })
  })

  test('日時（TOML の datetime を含む）は ISO 文字列にする', () => {
    const result = toJsonValue({ at: new Date('1979-05-27T07:32:00Z') })
    expect(result).toEqual({ ok: true, value: { at: '1979-05-27T07:32:00.000Z' } })
  })

  test('安全整数に収まる bigint は number にする', () => {
    expect(toJsonValue(42n)).toEqual({ ok: true, value: 42 })
  })

  test('安全整数を超える bigint は桁を落とさず文字列にする', () => {
    expect(toJsonValue(12345678901234567890n)).toEqual({ ok: true, value: '12345678901234567890' })
  })

  test('undefined のプロパティは落とす（JSON に書けないため）', () => {
    expect(toJsonValue({ a: 1, b: undefined })).toEqual({ ok: true, value: { a: 1 } })
  })

  test('NaN は扱えない値として、場所つきで失敗する', () => {
    const result = toJsonValue({ a: { b: Number.NaN } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.path).toBe('$.a.b')
  })

  test('関数は扱えない値として、場所つきで失敗する', () => {
    const result = toJsonValue([1, () => 1])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.path).toBe('$[1]')
    expect(result.error.kind).toBe('unsupported_value')
  })
})
