import { describe, expect, test } from 'bun:test'

import { DEFAULT_RETENTION, planRetention, type RetentionPolicy } from './retention.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY
const policy: RetentionPolicy = { keepCount: 3, keepMs: 7 * DAY, maxVersions: 6, maxBytes: 1_000 }

// version 1..n、createdAt と size を指定して並べる
const versions = (...entries: [createdAt: number, size?: number][]) =>
  entries.map(([createdAt, size = 10], i) => ({ version: i + 1, createdAt, size }))

describe('planRetention', () => {
  test('keeps the newest keepCount versions even when they are old', () => {
    const plan = planRetention(
      versions([NOW - 30 * DAY], [NOW - 20 * DAY], [NOW - 10 * DAY]),
      policy,
      NOW,
    )
    expect(plan).toEqual({ ok: true, value: { prune: [] } })
  })

  test('prunes versions that are both outside keepCount and older than keepMs', () => {
    const plan = planRetention(
      versions(
        [NOW - 30 * DAY],
        [NOW - 20 * DAY],
        [NOW - 10 * DAY],
        [NOW - 9 * DAY],
        [NOW - 8 * DAY],
      ),
      policy,
      NOW,
    )
    expect(plan).toEqual({ ok: true, value: { prune: [1, 2] } })
  })

  test('never prunes a version created within keepMs, however many there are', () => {
    const recent = Array.from({ length: 6 }, (_, i): [number] => [NOW - i * 1000])
    expect(planRetention(versions(...recent), policy, NOW)).toEqual({
      ok: true,
      value: { prune: [] },
    })
  })

  test('a version exactly keepMs old is still kept; one millisecond older is not', () => {
    const plan = planRetention(
      versions([NOW - 7 * DAY - 1], [NOW - 7 * DAY], [NOW], [NOW], [NOW]),
      policy,
      NOW,
    )
    expect(plan).toEqual({ ok: true, value: { prune: [1] } })
  })

  test('exactly keepCount versions are all kept', () => {
    const plan = planRetention(versions([0], [0], [0]), policy, NOW)
    expect(plan).toEqual({ ok: true, value: { prune: [] } })
  })

  test('versions with the same createdAt are ordered by version number', () => {
    const plan = planRetention(versions([0], [0], [0], [0], [0]), policy, NOW)
    expect(plan).toEqual({ ok: true, value: { prune: [1, 2] } })
  })

  test('input order does not matter', () => {
    const shuffled = versions([0], [0], [0], [0], [0]).toReversed()
    expect(planRetention(shuffled, policy, NOW)).toEqual({ ok: true, value: { prune: [1, 2] } })
  })

  test('refuses (instead of pruning) when kept versions exceed maxVersions', () => {
    const recent = Array.from({ length: 7 }, (): [number] => [NOW])
    const plan = planRetention(versions(...recent), policy, NOW)
    expect(plan).toEqual({ ok: false, error: { reason: 'too-many-versions', kept: 7, limit: 6 } })
  })

  test('refuses when kept versions exceed maxBytes', () => {
    const plan = planRetention(versions([NOW, 600], [NOW, 401]), policy, NOW)
    expect(plan).toEqual({
      ok: false,
      error: { reason: 'too-large', keptBytes: 1_001, limit: 1_000 },
    })
  })

  test('pruned versions do not count towards the limits', () => {
    const old = Array.from({ length: 5 }, (): [number, number] => [0, 300])
    const plan = planRetention(versions(...old, [NOW, 100]), policy, NOW)
    expect(plan).toEqual({ ok: true, value: { prune: [1, 2, 3] } })
  })

  test('the default policy keeps 20 versions and 7 days, within D1 limits', () => {
    expect(DEFAULT_RETENTION.keepCount).toBe(20)
    expect(DEFAULT_RETENTION.keepMs).toBe(7 * DAY)
    expect(DEFAULT_RETENTION.maxVersions).toBe(500)
    expect(DEFAULT_RETENTION.maxBytes).toBe(1024 * 1024 * 1024)
  })
})
