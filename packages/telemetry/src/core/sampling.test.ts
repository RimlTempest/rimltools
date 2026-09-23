import { describe, expect, test } from 'bun:test'

import { exportDecision, headDecision } from './sampling.ts'

describe('headDecision', () => {
  test('follows a sampled parent regardless of the ratio', () => {
    expect(headDecision({ parentSampled: true, ratio: 0, random: 0.99 })).toEqual({
      sampled: true,
      reason: 'parent',
    })
  })

  test('samples when random < ratio', () => {
    expect(headDecision({ parentSampled: undefined, ratio: 0.1, random: 0.05 })).toEqual({
      sampled: true,
      reason: 'head',
    })
    expect(headDecision({ parentSampled: undefined, ratio: 0.1, random: 0.1 }).sampled).toBe(false)
  })

  test('an unsampled parent does not force a drop (tail rules may still keep it)', () => {
    expect(headDecision({ parentSampled: false, ratio: 1, random: 0 }).sampled).toBe(true)
  })
})

describe('exportDecision (tail)', () => {
  const base = {
    head: { sampled: false, reason: 'head' },
    status: 200,
    error: false,
    durationMs: 5,
    slowMs: 1000,
  } as const

  test('drops fast successful requests that were not head-sampled', () => {
    expect(exportDecision(base)).toEqual({ export: false })
  })

  test('keeps head-sampled requests with the head reason', () => {
    expect(exportDecision({ ...base, head: { sampled: true, reason: 'head' } })).toEqual({
      export: true,
      reason: 'head',
      ratio: undefined,
    })
  })

  test('always keeps 5xx and exceptions', () => {
    expect(exportDecision({ ...base, status: 503 })).toMatchObject({
      export: true,
      reason: 'error',
    })
    expect(exportDecision({ ...base, error: true })).toMatchObject({
      export: true,
      reason: 'error',
    })
  })

  test('keeps 4xx only when head-sampled', () => {
    expect(exportDecision({ ...base, status: 404 }).export).toBe(false)
  })

  test('always keeps slow requests', () => {
    expect(exportDecision({ ...base, durationMs: 1000 })).toMatchObject({
      export: true,
      reason: 'slow',
    })
  })
})
