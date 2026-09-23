import { describe, expect, test } from 'bun:test'

import { ErrorCode } from '@openfeature/core'
import { OpenFeature } from '@openfeature/server-sdk'
import type { Logger } from '@openfeature/server-sdk'

import { createD1FlagProvider } from './openfeature.ts'
import type { D1Like } from './store.ts'

const logger: Logger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }

const db = (definitions: unknown[]): D1Like => ({
  prepare: () => ({
    all: async () => ({
      results: definitions.map((d) => ({
        key: typeof d === 'object' && d !== null && 'key' in d ? String(d.key) : '?',
        definition: JSON.stringify(d),
      })),
    }),
  }),
})

const theme = {
  key: 'theme',
  description: 'd',
  type: 'object',
  enabled: true,
  variants: { a: { accent: 'blue' }, b: { accent: 'red' } },
  defaultVariant: 'a',
}

const beta = {
  key: 'beta',
  description: 'd',
  type: 'boolean',
  enabled: true,
  variants: { on: true, off: false },
  defaultVariant: 'off',
  rules: [{ when: [{ attribute: 'userId', op: 'eq', value: 'me' }], variant: 'on' }],
}

describe('createD1FlagProvider', () => {
  const provider = createD1FlagProvider({
    db: db([theme, beta]),
    tool: 'noter',
    ttlSeconds: 60,
    log: () => {},
  })

  test('resolves booleans with OpenFeature details', async () => {
    const details = await provider.resolveBooleanEvaluation('beta', false, { userId: 'me' }, logger)
    expect(details).toEqual({ value: true, variant: 'on', reason: 'TARGETING_MATCH' })
  })

  test('maps missing flags and type mismatches to OpenFeature error codes', async () => {
    const missing = await provider.resolveStringEvaluation('nope', 'x', {}, logger)
    expect(missing).toMatchObject({
      value: 'x',
      reason: 'ERROR',
      errorCode: ErrorCode.FLAG_NOT_FOUND,
    })
    const mismatch = await provider.resolveNumberEvaluation('beta', 1, {}, logger)
    expect(mismatch.errorCode).toBe(ErrorCode.TYPE_MISMATCH)
  })

  test('resolves object flags', async () => {
    const details = await provider.resolveObjectEvaluation('theme', { accent: 'gray' }, {}, logger)
    expect(details.value).toEqual({ accent: 'blue' })
  })

  test('drops context values the evaluator does not understand', async () => {
    const details = await provider.resolveBooleanEvaluation(
      'beta',
      false,
      { userId: 'me', when: new Date(0), nested: { a: 1 } },
      logger,
    )
    expect(details.value).toBe(true)
  })

  test('works through the OpenFeature SDK', async () => {
    await OpenFeature.setProviderAndWait(provider)
    const client = OpenFeature.getClient()
    expect(await client.getBooleanValue('beta', false, { userId: 'me' })).toBe(true)
    expect(await client.getBooleanValue('missing', true)).toBe(true)
    await OpenFeature.close()
  })
})
