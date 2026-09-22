import { describe, expect, test } from 'bun:test'

import { parseUserId } from '@rimltools/contract'

import { makeCurrentActor, makeToActor } from './current-actor.ts'

const RAW_ID = 'usr_0123456789abcdefghjkmnpq'
const parsed = parseUserId(RAW_ID)
if (!parsed.ok) throw new Error('fixture')
const USER_ID = parsed.value
const expiresAt = new Date('2026-10-01T00:00:00.000Z')
const toActor = makeToActor({ guestDisplayName: 'ゲスト', userFallbackName: 'サインイン中' })

describe('toActor', () => {
  test('no session or a broken id is a visitor (fail closed)', () => {
    expect(toActor(null)).toEqual({ kind: 'visitor' })
    expect(toActor(undefined)).toEqual({ kind: 'visitor' })
    expect(toActor({ user: { id: 'bogus', name: 'x' }, session: { expiresAt } })).toEqual({
      kind: 'visitor',
    })
  })

  test('an anonymous user is a guest with the session expiry', () => {
    expect(
      toActor({ user: { id: RAW_ID, name: ' ', isAnonymous: true }, session: { expiresAt } }),
    ).toEqual({
      kind: 'guest',
      userId: USER_ID,
      displayName: 'ゲスト',
      sessionExpiresAt: expiresAt,
    })
  })

  test('a Google user falls back to the product name when the name is blank', () => {
    expect(toActor({ user: { id: RAW_ID, name: '' }, session: { expiresAt } })).toEqual({
      kind: 'user',
      userId: USER_ID,
      displayName: 'サインイン中',
    })
  })
})

describe('makeCurrentActor', () => {
  test('a failing session lookup still yields a visitor', async () => {
    const current = makeCurrentActor(toActor, async () => {
      throw new Error('D1 down')
    })
    expect(await current(new Request('https://x.example'))).toEqual({ kind: 'visitor' })
  })
})
