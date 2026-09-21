import { describe, expect, test } from 'bun:test'

import { judgeCanary, parseInvocations } from './analysis.ts'

describe('judgeCanary', () => {
  const opts = { minSamples: 200 }

  test('passes when the new version is as healthy as the old one', () => {
    const verdict = judgeCanary({ requests: 1000, errors: 5 }, { requests: 9000, errors: 40 }, opts)
    expect(verdict.kind).toBe('pass')
  })

  test('fails when the error rate exceeds old + 1pt', () => {
    // old 3% → 上限 4%。new 5% は不合格
    const verdict = judgeCanary(
      { requests: 1000, errors: 50 },
      { requests: 1000, errors: 30 },
      opts,
    )
    expect(verdict.kind).toBe('fail')
  })

  test('tolerates up to 2% even when the old version was perfect', () => {
    expect(
      judgeCanary({ requests: 1000, errors: 20 }, { requests: 1000, errors: 0 }, opts).kind,
    ).toBe('pass')
    expect(
      judgeCanary({ requests: 1000, errors: 21 }, { requests: 1000, errors: 0 }, opts).kind,
    ).toBe('fail')
  })

  test('is insufficient below the minimum sample', () => {
    const verdict = judgeCanary({ requests: 150, errors: 0 }, { requests: 5000, errors: 0 }, opts)
    expect(verdict).toEqual({ kind: 'insufficient', requests: 150, needed: 200 })
  })

  test('fails fast on an obviously broken version even with few samples', () => {
    // サンプル不足でも半数以上が失敗なら待たずに落とす
    const verdict = judgeCanary({ requests: 40, errors: 30 }, { requests: 5000, errors: 0 }, opts)
    expect(verdict.kind).toBe('fail')
  })
})

describe('parseInvocations', () => {
  test('sums requests and errors per script version', () => {
    const body = {
      data: {
        viewer: {
          accounts: [
            {
              workersInvocationsAdaptive: [
                { sum: { requests: 10, errors: 1 }, dimensions: { scriptVersion: 'a' } },
                { sum: { requests: 5, errors: 0 }, dimensions: { scriptVersion: 'a' } },
                { sum: { requests: 7, errors: 2 }, dimensions: { scriptVersion: 'b' } },
              ],
            },
          ],
        },
      },
    }
    const result = parseInvocations(body)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.get('a')).toEqual({ requests: 15, errors: 1 })
    expect(result.value.get('b')).toEqual({ requests: 7, errors: 2 })
  })

  test('reports GraphQL errors', () => {
    const result = parseInvocations({ errors: [{ message: 'unknown field scriptVersion' }] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('unknown field scriptVersion')
  })
})
