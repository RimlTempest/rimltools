import { describe, expect, test } from 'bun:test'
import { convertTargets } from './convert-targets.ts'

describe('convertTargets', () => {
  test('自分以外のデータ種別を返す', () => {
    expect(convertTargets('json')).toEqual(['yaml', 'toml'])
    expect(convertTargets('yaml')).toEqual(['toml', 'json'])
    expect(convertTargets('toml')).toEqual(['yaml', 'json'])
  })

  test('自分自身は変換先にしない', () => {
    for (const kind of ['yaml', 'toml', 'json'] as const) {
      expect(convertTargets(kind)).not.toContain(kind)
    }
  })

  test('markdown からは変換しない', () => {
    expect(convertTargets('markdown')).toEqual([])
  })
})
