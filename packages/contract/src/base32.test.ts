import { describe, expect, test } from 'bun:test'
import { encodeCrockfordBase32 } from './base32.ts'

describe('Crockford base32', () => {
  test('5 バイト（40 bit）はちょうど 8 文字になる', () => {
    expect(encodeCrockfordBase32(new Uint8Array([0, 0, 0, 0, 0]))).toBe('00000000')
  })

  test('全ビット 1 は最後の文字まで z になる', () => {
    expect(encodeCrockfordBase32(new Uint8Array([255, 255, 255, 255, 255]))).toBe('zzzzzzzz')
  })

  test('5 の倍数でないバイト数でも端数を落とさない', () => {
    // 1 バイト = 8 bit → 2 文字（2 文字目は端数 2 bit を左詰め）
    expect(encodeCrockfordBase32(new Uint8Array([0b11111111]))).toBe('zw')
    expect(encodeCrockfordBase32(new Uint8Array([0]))).toBe('00')
  })

  test('空入力は空文字', () => {
    expect(encodeCrockfordBase32(new Uint8Array([]))).toBe('')
  })

  test('紛らわしい文字 i l o u を使わない', () => {
    const encoded = encodeCrockfordBase32(new Uint8Array(64).map((_, index) => index * 4))
    expect(/[ilou]/.test(encoded)).toBe(false)
  })
})
