import { describe, expect, test } from 'bun:test'
import { buildGeoPayload } from './geo.ts'

describe('buildGeoPayload', () => {
  test('緯度・経度から組み立てる', () => {
    const result = buildGeoPayload({ lat: '35.681236', lon: '139.767125' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.lat).toBeCloseTo(35.681236)
    expect(result.value.lon).toBeCloseTo(139.767125)
  })

  test('境界値（±90, ±180）は受け付ける', () => {
    for (const [lat, lon] of [
      ['90', '180'],
      ['-90', '-180'],
    ] as const) {
      const result = buildGeoPayload({ lat, lon })
      expect(result.ok).toBe(true)
    }
  })

  test('緯度が範囲外なら失敗する', () => {
    const result = buildGeoPayload({ lat: '90.0001', lon: '0' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_lat')
  })

  test('経度が範囲外なら失敗する', () => {
    const result = buildGeoPayload({ lat: '0', lon: '180.0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_lon')
  })

  test('空文字は不正として扱う', () => {
    const result = buildGeoPayload({ lat: '', lon: '0' })
    expect(result.ok).toBe(false)
  })

  test('数字以外は不正として扱う', () => {
    const result = buildGeoPayload({ lat: '0', lon: 'abc' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_lon')
  })
})
