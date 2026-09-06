import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { Actor } from './actor.ts'
import { actorDisplayName, actorUserId, isSignedIn } from './actor.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')

const visitor: Actor = { kind: 'visitor' }
const guest: Actor = {
  kind: 'guest',
  userId: USER_ID,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-06T00:00:00Z'),
}
const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }

describe('Actor', () => {
  test('サインインしているかを一言で判定できる', () => {
    expect(isSignedIn(visitor)).toBe(false)
    expect(isSignedIn(guest)).toBe(true)
    expect(isSignedIn(user)).toBe(true)
  })

  test('visitor には UserId がない（noter-sync に actor を渡さない）', () => {
    expect(actorUserId(visitor)).toBeUndefined()
  })

  test('ゲストとサインイン済みは検証済みの UserId を持つ', () => {
    expect(actorUserId(guest)).toBe(USER_ID)
    expect(actorUserId(user)).toBe(USER_ID)
  })

  test('表示名は visitor だけ持たない', () => {
    expect(actorDisplayName(visitor)).toBeUndefined()
    expect(actorDisplayName(guest)).toBe('ゲスト')
    expect(actorDisplayName(user)).toBe('りむ')
  })
})
