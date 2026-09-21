import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { Actor } from './actor.ts'
import { parseActorWire, toActorWire } from './actor-wire.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')
const EXPIRES_AT = new Date('2026-10-06T00:00:00.000Z')

const guest: Actor = {
  kind: 'guest',
  userId: USER_ID,
  displayName: 'ゲスト',
  sessionExpiresAt: EXPIRES_AT,
}
const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }

describe('ActorWire', () => {
  test('visitor は往復しても visitor', () => {
    expect(parseActorWire(toActorWire({ kind: 'visitor' }))).toEqual({ kind: 'visitor' })
  })

  test('ゲストは期限つきで往復する', () => {
    expect(parseActorWire(toActorWire(guest))).toEqual(guest)
  })

  test('サインイン済みユーザーは往復する', () => {
    expect(parseActorWire(toActorWire(user))).toEqual(user)
  })

  test('JSON を通しても壊れない（server function の戻り値を想定）', () => {
    const revived: unknown = JSON.parse(JSON.stringify(toActorWire(guest)))
    expect(parseActorWire(revived)).toEqual(guest)
  })

  test('形が違うものは visitor に倒す', () => {
    expect(parseActorWire(undefined)).toEqual({ kind: 'visitor' })
    expect(parseActorWire(null)).toEqual({ kind: 'visitor' })
    expect(parseActorWire('user')).toEqual({ kind: 'visitor' })
    expect(parseActorWire({ kind: 'admin' })).toEqual({ kind: 'visitor' })
  })

  test('UserId が検証を通らなければ visitor に倒す', () => {
    expect(parseActorWire({ kind: 'user', userId: 'usr_short', displayName: 'x' })).toEqual({
      kind: 'visitor',
    })
    expect(parseActorWire({ kind: 'user', userId: 'doc_0123456789abcdefghjkmnpq' })).toEqual({
      kind: 'visitor',
    })
  })

  test('ゲストの期限が読めなければ visitor に倒す', () => {
    expect(
      parseActorWire({
        kind: 'guest',
        userId: USER_ID,
        displayName: 'ゲスト',
        sessionExpiresAt: 'いつか',
      }),
    ).toEqual({ kind: 'visitor' })
  })
})
