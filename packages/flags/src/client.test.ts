import { describe, expect, test } from 'bun:test'

import { createFlagClient } from './client.ts'
import type { FlagDefinition } from './core/types.ts'

const flags = (defs: FlagDefinition[]) => ({
  load: async () => ({ ok: true as const, value: new Map(defs.map((d) => [d.key, d])) }),
})

const failing = { load: async () => ({ ok: false as const, error: 'D1 down' }) }

const toggle: FlagDefinition = {
  key: 'new-editor',
  description: 'd',
  type: 'boolean',
  enabled: true,
  variants: { on: true, off: false },
  defaultVariant: 'off',
  rules: [{ when: [{ attribute: 'userId', op: 'eq', value: 'me' }], variant: 'on' }],
}

const experiment: FlagDefinition = {
  key: 'cta-copy',
  description: 'd',
  type: 'string',
  enabled: true,
  variants: { control: 'Save', treatment: 'Keep it' },
  defaultVariant: 'control',
  rules: [],
  distribution: { control: 50, treatment: 50 },
  experiment: 'cta-2026-09',
}

describe('createFlagClient', () => {
  test('evaluates a flag of the requested type', async () => {
    const client = createFlagClient({ store: flags([toggle]), tool: 'noter', log: () => {} })
    const on = await client.boolean('new-editor', false, { targetingKey: 'x', userId: 'me' })
    expect(on).toEqual({ value: true, variant: 'on', reason: 'TARGETING_MATCH' })
  })

  test('returns the caller default for unknown flags', async () => {
    const client = createFlagClient({ store: flags([]), tool: 'noter', log: () => {} })
    const result = await client.boolean('missing', true)
    expect(result).toEqual({ value: true, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND' })
  })

  test('returns the caller default when the type does not match', async () => {
    const client = createFlagClient({ store: flags([toggle]), tool: 'noter', log: () => {} })
    const result = await client.string('new-editor', 'fallback')
    expect(result).toMatchObject({ value: 'fallback', errorCode: 'TYPE_MISMATCH' })
  })

  test('returns the caller default when the store fails', async () => {
    const client = createFlagClient({ store: failing, tool: 'noter', log: () => {} })
    const result = await client.boolean('new-editor', false, {})
    expect(result).toMatchObject({ value: false, errorCode: 'GENERAL' })
  })

  test('logs exposures for experiments only by default', async () => {
    const logged: unknown[] = []
    const client = createFlagClient({
      store: flags([toggle, experiment]),
      tool: 'qrcc',
      log: (e) => logged.push(e),
    })
    await client.boolean('new-editor', false, { targetingKey: 'u1', userId: 'me' })
    const e = await client.string('cta-copy', 'Save', { targetingKey: 'u1' })
    expect(e.reason).toBe('SPLIT')
    expect(logged).toEqual([
      {
        event: 'flag_exposure',
        tool: 'qrcc',
        flag: 'cta-copy',
        variant: 'variant' in e ? e.variant : undefined,
        experiment: 'cta-2026-09',
      },
    ])
  })

  test('exposure: "all" logs every successful evaluation, "none" logs nothing', async () => {
    const all: unknown[] = []
    await createFlagClient({
      store: flags([toggle]),
      tool: 'qrcc',
      log: (e) => all.push(e),
      exposure: 'all',
    }).boolean('new-editor', false)
    expect(all).toHaveLength(1)

    const none: unknown[] = []
    await createFlagClient({
      store: flags([experiment]),
      tool: 'qrcc',
      log: (e) => none.push(e),
      exposure: 'none',
    }).string('cta-copy', 'Save', { targetingKey: 'u' })
    expect(none).toHaveLength(0)
  })
})
