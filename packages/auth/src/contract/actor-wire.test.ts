import { describe, expect, test } from 'bun:test'

import type { Actor } from './actor.ts'
import { parseActorWire, toActorWire } from './actor-wire.ts'

const USER_ID = 'usr_0123456789abcdefghjkmnpq'

describe('actor wire', () => {
  test('round-trips every kind', () => {
    const actors: Actor[] = [{ kind: 'visitor' }]
    const parsedId = parseActorWire({ kind: 'user', userId: USER_ID, displayName: 'A' })
    if (parsedId.kind !== 'user') throw new Error('fixture')
    actors.push(parsedId, {
      kind: 'guest',
      userId: parsedId.userId,
      displayName: 'ゲスト',
      sessionExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
    })
    for (const actor of actors) expect(parseActorWire(toActorWire(actor))).toEqual(actor)
  })

  test.each([
    null,
    'user',
    { kind: 'admin', userId: USER_ID },
    { kind: 'user', userId: 'not-an-id', displayName: 'x' },
    { kind: 'guest', userId: USER_ID, displayName: 'x', sessionExpiresAt: 'not a date' },
  ])('treats %p as a visitor (fail closed)', (value) => {
    expect(parseActorWire(value)).toEqual({ kind: 'visitor' })
  })
})
