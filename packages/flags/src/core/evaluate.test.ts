import { describe, expect, test } from 'bun:test'

import { evaluateFlag } from './evaluate.ts'
import type { FlagDefinition } from './types.ts'

const boolFlag = (overrides: Partial<FlagDefinition> = {}): FlagDefinition => ({
  key: 'new-editor',
  description: 'd',
  type: 'boolean',
  enabled: true,
  variants: { on: true, off: false },
  defaultVariant: 'off',
  rules: [],
  ...overrides,
})

const ok = (def: FlagDefinition, ctx: Parameters<typeof evaluateFlag>[1]) => {
  const result = evaluateFlag(def, ctx)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('evaluateFlag', () => {
  test('serves the default variant when disabled (kill switch)', () => {
    const def = boolFlag({ enabled: false, rollout: { percentage: 100, variant: 'on' } })
    expect(ok(def, { targetingKey: 'u1' })).toEqual({
      value: false,
      variant: 'off',
      reason: 'DISABLED',
    })
  })

  test('serves the default variant statically when nothing targets', () => {
    expect(ok(boolFlag(), { targetingKey: 'u1' })).toEqual({
      value: false,
      variant: 'off',
      reason: 'STATIC',
    })
  })

  test('dark launch: a rule turns the flag on for listed users only', () => {
    const def = boolFlag({
      rules: [{ when: [{ attribute: 'userId', op: 'in', value: ['me'] }], variant: 'on' }],
    })
    expect(ok(def, { targetingKey: 'x', userId: 'me' })).toMatchObject({
      value: true,
      reason: 'TARGETING_MATCH',
    })
    expect(ok(def, { targetingKey: 'x', userId: 'you' })).toMatchObject({
      value: false,
      reason: 'DEFAULT',
    })
  })

  test('rules: all conditions must match, first matching rule wins', () => {
    const def: FlagDefinition = {
      ...boolFlag(),
      type: 'string',
      variants: { a: 'A', b: 'B', z: 'Z' },
      defaultVariant: 'z',
      rules: [
        {
          when: [
            { attribute: 'email', op: 'startsWith', value: 'dev@' },
            { attribute: 'plan', op: 'eq', value: 'pro' },
          ],
          variant: 'a',
        },
        { when: [{ attribute: 'plan', op: 'eq', value: 'pro' }], variant: 'b' },
      ],
    }
    expect(ok(def, { email: 'dev@x', plan: 'pro' }).value).toBe('A')
    expect(ok(def, { email: 'ops@x', plan: 'pro' }).value).toBe('B')
    expect(ok(def, { email: 'dev@x', plan: 'free' }).value).toBe('Z')
  })

  test('feature canary: percentage rollout is sticky per subject', () => {
    const def = boolFlag({ rollout: { percentage: 10, variant: 'on' } })
    const n = 5000
    let on = 0
    for (let i = 0; i < n; i += 1) {
      const e = ok(def, { targetingKey: `u-${i}` })
      if (e.value === true) {
        on += 1
        expect(e.reason).toBe('SPLIT')
      }
      expect(ok(def, { targetingKey: `u-${i}` }).value).toBe(e.value)
    }
    expect(on / n).toBeGreaterThan(0.08)
    expect(on / n).toBeLessThan(0.12)
  })

  test('raising the rollout only adds subjects (nobody flips back)', () => {
    const at = (p: number) => boolFlag({ rollout: { percentage: p, variant: 'on' } })
    for (let i = 0; i < 2000; i += 1) {
      const ctx = { targetingKey: `u-${i}` }
      if (ok(at(10), ctx).value === true) expect(ok(at(50), ctx).value).toBe(true)
    }
  })

  test('A/B: weighted distribution splits subjects by variant', () => {
    const def: FlagDefinition = {
      ...boolFlag(),
      type: 'string',
      variants: { control: 'old', treatment: 'new' },
      defaultVariant: 'control',
      distribution: { control: 50, treatment: 50 },
      experiment: 'exp-1',
    }
    const counts = { control: 0, treatment: 0 }
    for (let i = 0; i < 4000; i += 1) {
      const e = ok(def, { targetingKey: `v-${i}` })
      if (e.variant === 'control' || e.variant === 'treatment') counts[e.variant] += 1
      expect(e.reason).toBe('SPLIT')
    }
    expect(counts.control / 4000).toBeGreaterThan(0.45)
    expect(counts.treatment / 4000).toBeGreaterThan(0.45)
  })

  test('rollout + distribution: only subjects inside the rollout enter the experiment', () => {
    const def: FlagDefinition = {
      ...boolFlag(),
      type: 'string',
      variants: { off: 'off', control: 'c', treatment: 't' },
      defaultVariant: 'off',
      rollout: { percentage: 20 },
      distribution: { control: 50, treatment: 50 },
    }
    let inside = 0
    for (let i = 0; i < 5000; i += 1) {
      if (ok(def, { targetingKey: `w-${i}` }).variant !== 'off') inside += 1
    }
    expect(inside / 5000).toBeGreaterThan(0.17)
    expect(inside / 5000).toBeLessThan(0.23)
  })

  test('without a subject, splits fall back to the default variant', () => {
    const def = boolFlag({ rollout: { percentage: 100, variant: 'on' } })
    expect(ok(def, {})).toEqual({ value: false, variant: 'off', reason: 'DEFAULT' })
  })

  test('returns an error instead of throwing when a variant is missing', () => {
    const result = evaluateFlag(boolFlag({ defaultVariant: 'nope' }), {})
    expect(result.ok).toBe(false)
  })
})
