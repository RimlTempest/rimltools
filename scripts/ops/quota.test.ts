import { describe, expect, test } from 'bun:test'

import { FREE_LIMITS, quotaStatus } from './quota.ts'

describe('quotaStatus', () => {
  test('reports ratios against the Workers Free limits', () => {
    const items = quotaStatus({
      workersRequests: 50_000,
      d1RowsWritten: 10_000,
      d1RowsRead: 4_000_000,
    })
    expect(items.map((i) => [i.key, i.ratio, i.alert])).toEqual([
      ['workersRequests', 0.5, false],
      ['d1RowsWritten', 0.1, false],
      ['d1RowsRead', 0.8, true],
    ])
  })

  test('alerts at exactly the threshold', () => {
    const items = quotaStatus(
      { workersRequests: 70_000, d1RowsWritten: 0, d1RowsRead: 0 },
      FREE_LIMITS,
      0.7,
    )
    expect(items[0]?.alert).toBe(true)
  })
})
