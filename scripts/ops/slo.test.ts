import { describe, expect, test } from 'bun:test'

import { errorBudget } from './slo.ts'

describe('errorBudget', () => {
  test('healthy when few errors against the allowance', () => {
    // 99.5% of 10,000 → 50 errors allowed
    const b = errorBudget(99.5, { requests: 10_000, errors: 10 })
    expect(b.allowedErrors).toBe(50)
    expect(b.consumed).toBeCloseTo(0.2)
    expect(b.remaining).toBeCloseTo(0.8)
    expect(b.availability).toBeCloseTo(99.9)
    expect(b.state).toBe('healthy')
  })

  test('burning once half of the budget is gone', () => {
    expect(errorBudget(99.5, { requests: 10_000, errors: 30 }).state).toBe('burning')
  })

  test('exhausted at or beyond the allowance, remaining never negative', () => {
    const b = errorBudget(99.5, { requests: 10_000, errors: 80 })
    expect(b.state).toBe('exhausted')
    expect(b.remaining).toBe(0)
    expect(b.consumed).toBeCloseTo(1.6)
  })

  test('no traffic is its own state, not a pass or a fail', () => {
    const b = errorBudget(99.5, { requests: 0, errors: 0 })
    expect(b.state).toBe('no-traffic')
    expect(b.availability).toBeNull()
  })

  test('a 100% target with any error is exhausted', () => {
    expect(errorBudget(100, { requests: 10, errors: 1 }).state).toBe('exhausted')
    expect(errorBudget(100, { requests: 10, errors: 0 }).state).toBe('healthy')
  })
})
