import { describe, expect, test } from 'bun:test'

import { bucketOf, fnv1a32 } from './hash.ts'

describe('fnv1a32', () => {
  test('matches the reference FNV-1a 32-bit values', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
  })

  test('hashes UTF-8 bytes, not UTF-16 code units', () => {
    // 'é' は UTF-8 で 2 バイト（0xc3 0xa9）
    expect(fnv1a32('é')).toBe(fnv1a32('é'))
    expect(fnv1a32('é')).not.toBe(fnv1a32('e'))
  })
})

describe('bucketOf', () => {
  test('is deterministic and within 0..9999', () => {
    const a = bucketOf('flag', 'user-1')
    expect(a).toBe(bucketOf('flag', 'user-1'))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(10_000)
  })

  test('depends on both the flag key and the subject', () => {
    const subjects = Array.from({ length: 50 }, (_, i) => `user-${i}`)
    const differsByFlag = subjects.some((s) => bucketOf('a', s) !== bucketOf('b', s))
    expect(differsByFlag).toBe(true)
  })

  test('spreads subjects roughly uniformly', () => {
    const n = 20_000
    let below = 0
    for (let i = 0; i < n; i += 1) if (bucketOf('spread', `s-${i}`) < 1000) below += 1
    // 10% ± 1.5pt
    expect(below / n).toBeGreaterThan(0.085)
    expect(below / n).toBeLessThan(0.115)
  })
})
