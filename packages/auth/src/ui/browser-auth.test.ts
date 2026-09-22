import { describe, expect, test } from 'bun:test'

import { makeBaseAuthActions, toAuthResult } from './browser-auth.ts'
import type { AuthClientLike } from './browser-auth.ts'

const fakeClient = (error: unknown): { client: AuthClientLike; calls: unknown[] } => {
  const calls: unknown[] = []
  const reply = async () => ({ error })
  return {
    calls,
    client: {
      signIn: {
        anonymous: async () => {
          calls.push('anonymous')
          return reply()
        },
        social: async (options) => {
          calls.push(options)
          return reply()
        },
      },
      signOut: async () => {
        calls.push('signOut')
        return reply()
      },
    },
  }
}

const detail = (error: unknown) => {
  const result = toAuthResult({ error })
  return result.ok ? undefined : result.error.detail
}

describe('toAuthResult', () => {
  test('no error is success', () => {
    expect(toAuthResult({ error: null })).toEqual({ ok: true, value: undefined })
    expect(toAuthResult({})).toEqual({ ok: true, value: undefined })
  })

  test('uses the message, then the status text, then a generic reason', () => {
    expect(detail({ message: 'rate limited' })).toBe('rate limited')
    expect(detail({ statusText: 'Bad Gateway' })).toBe('Bad Gateway')
    expect(detail('boom')).toBe('原因不明')
  })
})

describe('makeBaseAuthActions', () => {
  test('signs in as a guest, with Google (returning to the callback) and out', async () => {
    const { client, calls } = fakeClient(null)
    const actions = makeBaseAuthActions(client, { callbackURL: '/codes' })
    expect(await actions.signInAsGuest()).toEqual({ ok: true, value: undefined })
    expect(await actions.signInWithGoogle()).toEqual({ ok: true, value: undefined })
    expect(await actions.signOut()).toEqual({ ok: true, value: undefined })
    expect(calls).toEqual(['anonymous', { provider: 'google', callbackURL: '/codes' }, 'signOut'])
  })

  test('reports client errors as values', async () => {
    const { client } = fakeClient({ message: 'offline' })
    const actions = makeBaseAuthActions(client, { callbackURL: '/' })
    expect(await actions.signOut()).toEqual({
      ok: false,
      error: { kind: 'unavailable', detail: 'offline' },
    })
  })
})
