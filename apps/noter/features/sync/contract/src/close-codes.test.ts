import { describe, expect, test } from 'bun:test'
import { CLOSE_CODES, reasonOf } from './close-codes.ts'

describe('CLOSE_CODES', () => {
  test('docs/realtime-protocol.md §1 の表と同じ値を持つ', () => {
    expect(CLOSE_CODES).toEqual({
      badRequest: 4400,
      forbidden: 4403,
      notFound: 4404,
      tooLarge: 4413,
      limit: 4429,
    })
  })

  test('すべて 4000〜4999（クライアントが再接続しない帯）に入る', () => {
    for (const code of Object.values(CLOSE_CODES)) {
      expect(code).toBeGreaterThanOrEqual(4000)
      expect(code).toBeLessThanOrEqual(4999)
    }
  })
})

describe('reasonOf', () => {
  test('既知の close code を理由に変換する', () => {
    expect(reasonOf(CLOSE_CODES.badRequest)).toBe('bad_request')
    expect(reasonOf(CLOSE_CODES.forbidden)).toBe('forbidden')
    expect(reasonOf(CLOSE_CODES.notFound)).toBe('not_found')
    expect(reasonOf(CLOSE_CODES.tooLarge)).toBe('too_large')
    expect(reasonOf(CLOSE_CODES.limit)).toBe('limit')
  })

  test('未知の close code は null', () => {
    expect(reasonOf(1006)).toBeNull()
    expect(reasonOf(4001)).toBeNull()
  })
})
