import { describe, expect, test } from 'bun:test'

import { parseFlagDefinition, parseFlagFile } from './parse.ts'

const base = {
  key: 'new-editor',
  description: 'New editor',
  type: 'boolean',
  enabled: true,
  variants: { on: true, off: false },
  defaultVariant: 'off',
}

const errorsOf = (raw: unknown): string[] => {
  const result = parseFlagDefinition(raw)
  return result.ok ? [] : result.error
}

describe('parseFlagDefinition', () => {
  test('accepts a minimal definition and fills rules with []', () => {
    const result = parseFlagDefinition(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rules).toEqual([])
  })

  test('rejects keys that are not kebab-case', () => {
    expect(errorsOf({ ...base, key: 'New_Editor' }).join()).toContain('key')
  })

  test('rejects variant values that do not match the type', () => {
    expect(errorsOf({ ...base, variants: { on: 'yes', off: false } }).join()).toContain(
      'variants.on',
    )
  })

  test('rejects an unknown default variant', () => {
    expect(errorsOf({ ...base, defaultVariant: 'maybe' }).join()).toContain('defaultVariant')
  })

  test('rejects distribution weights that do not sum to 100', () => {
    const errors = errorsOf({ ...base, distribution: { on: 60, off: 30 } })
    expect(errors.join()).toContain('sum to 100')
  })

  test('rejects rollout outside 0..100 and rollout without a target', () => {
    expect(errorsOf({ ...base, rollout: { percentage: 120, variant: 'on' } }).join()).toContain(
      'rollout.percentage',
    )
    expect(errorsOf({ ...base, rollout: { percentage: 10 } }).join()).toContain('rollout.variant')
  })

  test('rejects rules that reference unknown variants or operators', () => {
    const errors = errorsOf({
      ...base,
      rules: [{ when: [{ attribute: 'userId', op: 'regex', value: 'x' }], variant: 'maybe' }],
    })
    expect(errors.join()).toContain('op')
    expect(errors.join()).toContain('variant')
  })

  test('requires an array value for the "in" operator', () => {
    const errors = errorsOf({
      ...base,
      rules: [{ when: [{ attribute: 'userId', op: 'in', value: 'me' }], variant: 'on' }],
    })
    expect(errors.join()).toContain('in')
  })
})

describe('parseFlagFile', () => {
  test('accepts a file and rejects duplicate keys', () => {
    expect(parseFlagFile({ tool: 'qrcc', flags: [base] }).ok).toBe(true)
    const dup = parseFlagFile({ tool: 'qrcc', flags: [base, base] })
    expect(dup.ok).toBe(false)
    if (dup.ok) return
    expect(dup.error.join()).toContain('duplicate')
  })

  test('accepts an empty flag list', () => {
    expect(parseFlagFile({ tool: 'noter', flags: [] }).ok).toBe(true)
  })
})
