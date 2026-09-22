import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { Actor } from './actor.ts'
import { parseActorWire, toActorWire } from './actor-wire.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')

const guest: Actor = {
  kind: 'guest',
  userId: USER_ID,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
}

describe('Actor のワイヤ表現', () => {
  test('往復しても同じ値になる（未ログイン）', () => {
    expect(parseActorWire(toActorWire({ kind: 'visitor' }))).toEqual({ kind: 'visitor' })
  })

  test('往復しても同じ値になる（ゲスト）', () => {
    expect(parseActorWire(toActorWire(guest))).toEqual(guest)
  })

  test('往復しても同じ値になる（サインイン済み）', () => {
    const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }
    expect(parseActorWire(toActorWire(user))).toEqual(user)
  })

  test('壊れた値は未ログイン扱いにする', () => {
    expect(parseActorWire(undefined)).toEqual({ kind: 'visitor' })
    expect(parseActorWire('guest')).toEqual({ kind: 'visitor' })
    expect(parseActorWire({ kind: 'guest' })).toEqual({ kind: 'visitor' })
    expect(parseActorWire({ kind: 'admin', userId: USER_ID })).toEqual({ kind: 'visitor' })
  })

  test('UserId の形が違えば未ログイン扱いにする', () => {
    expect(parseActorWire({ kind: 'user', userId: 'root', displayName: 'x' })).toEqual({
      kind: 'visitor',
    })
  })

  test('日時が読めなければ未ログイン扱いにする', () => {
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
