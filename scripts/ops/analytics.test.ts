import { describe, expect, test } from 'bun:test'

import { parseD1Rows, parseWorkerRows, sumTraffic, usageOn } from './analytics.ts'

const workersJson = {
  data: {
    viewer: {
      accounts: [
        {
          workersInvocationsAdaptive: [
            {
              sum: { requests: 100, errors: 1 },
              dimensions: { scriptName: 'qrcc-web', date: '2026-09-20' },
            },
            {
              sum: { requests: 50, errors: 0 },
              dimensions: { scriptName: 'qrcc-api', date: '2026-09-20' },
            },
            {
              sum: { requests: 30, errors: 3 },
              dimensions: { scriptName: 'noter-web', date: '2026-09-21' },
            },
          ],
        },
      ],
    },
  },
  errors: null,
}

const d1Json = {
  data: {
    viewer: {
      accounts: [
        {
          d1AnalyticsAdaptiveGroups: [
            {
              sum: { rowsRead: 1000, rowsWritten: 10 },
              dimensions: { date: '2026-09-21', databaseId: 'a' },
            },
            {
              sum: { rowsRead: 500, rowsWritten: 5 },
              dimensions: { date: '2026-09-21', databaseId: 'b' },
            },
            {
              sum: { rowsRead: 7, rowsWritten: 7 },
              dimensions: { date: '2026-09-20', databaseId: 'a' },
            },
          ],
        },
      ],
    },
  },
}

describe('parseWorkerRows', () => {
  test('flattens the GraphQL response', () => {
    const rows = parseWorkerRows(workersJson)
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.value).toHaveLength(3)
    expect(rows.value[0]).toEqual({
      script: 'qrcc-web',
      date: '2026-09-20',
      requests: 100,
      errors: 1,
    })
  })

  test('surfaces GraphQL errors instead of reporting zero traffic', () => {
    const rows = parseWorkerRows({ data: null, errors: [{ message: 'not authorized' }] })
    expect(rows.ok).toBe(false)
    if (rows.ok) return
    expect(rows.error).toContain('not authorized')
  })

  test('rejects an unexpected shape', () => {
    expect(parseWorkerRows({ data: { viewer: {} } }).ok).toBe(false)
  })
})

describe('parseD1Rows', () => {
  test('flattens the GraphQL response', () => {
    const rows = parseD1Rows(d1Json)
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.value[1]).toEqual({
      databaseId: 'b',
      date: '2026-09-21',
      rowsRead: 500,
      rowsWritten: 5,
    })
  })
})

describe('aggregation', () => {
  test('sumTraffic adds up the workers that belong to a tool', () => {
    const rows = parseWorkerRows(workersJson)
    if (!rows.ok) return
    expect(sumTraffic(rows.value, ['qrcc-web', 'qrcc-api'])).toEqual({ requests: 150, errors: 1 })
    expect(sumTraffic(rows.value, ['missing'])).toEqual({ requests: 0, errors: 0 })
  })

  test('usageOn totals the whole account for one day (the free limits are account-wide)', () => {
    const w = parseWorkerRows(workersJson)
    const d = parseD1Rows(d1Json)
    if (!w.ok || !d.ok) return
    expect(usageOn('2026-09-21', w.value, d.value)).toEqual({
      workersRequests: 30,
      d1RowsRead: 1500,
      d1RowsWritten: 15,
    })
  })
})
