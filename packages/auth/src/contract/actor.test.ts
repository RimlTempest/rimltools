import { describe, expect, test } from 'bun:test'

import { parseActorWire } from './actor-wire.ts'
import { actorUserId, isSignedIn } from './actor.ts'

const user = parseActorWire({
  kind: 'user',
  userId: 'usr_0123456789abcdefghjkmnpq',
  displayName: 'A',
})

describe('actor helpers', () => {
  test('a visitor is not signed in and has no user id', () => {
    expect(isSignedIn({ kind: 'visitor' })).toBe(false)
    expect(actorUserId({ kind: 'visitor' })).toBeUndefined()
  })

  test('a user is signed in and carries the verified id', () => {
    expect(isSignedIn(user)).toBe(true)
    expect(String(actorUserId(user))).toBe('usr_0123456789abcdefghjkmnpq')
  })
})
