import { describe, expect, test } from 'bun:test'
import { PRESENCE_COLOR_COUNT, presenceIndex } from './presence-color.ts'

describe('presenceIndex', () => {
  test('同じ id には常に同じ色を割り当てる', () => {
    expect(presenceIndex('usr_abc')).toBe(presenceIndex('usr_abc'))
  })

  test('0 以上 8 未満の整数を返す', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const index = presenceIndex(`usr_${seed}`)
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(PRESENCE_COLOR_COUNT)
    }
  })

  test('空文字でも落ちない', () => {
    expect(presenceIndex('')).toBeGreaterThanOrEqual(0)
  })

  test('8 色すべてが使われる', () => {
    const seen = new Set<number>()
    for (let seed = 0; seed < 400; seed += 1) seen.add(presenceIndex(`usr_${seed}`))
    expect(seen.size).toBe(PRESENCE_COLOR_COUNT)
  })

  test('違う id には（少なくとも一部で）違う色が付く', () => {
    expect(presenceIndex('usr_a')).not.toBe(presenceIndex('usr_b'))
  })
})
