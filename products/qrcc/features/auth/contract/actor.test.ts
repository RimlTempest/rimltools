import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { Actor } from './actor.ts'
import { CAPABILITIES, actorUserId, canUse, isSignedIn } from './actor.ts'

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
  sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
}
const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }

describe('Actor', () => {
  test('未ログインでも生成と読み取りは使える（ADR-0004）', () => {
    expect(canUse(visitor, 'generate')).toBe(true)
    expect(canUse(visitor, 'scan')).toBe(true)
  })

  test('保存・一覧・共有はログインを要求する', () => {
    expect(canUse(visitor, 'save')).toBe(false)
    expect(canUse(visitor, 'list')).toBe(false)
    expect(canUse(visitor, 'share')).toBe(false)
  })

  test('ゲストでも保存・一覧・共有はできる', () => {
    for (const capability of CAPABILITIES) {
      expect(canUse(guest, capability)).toBe(true)
    }
  })

  test('ログイン済みユーザーはすべて使える', () => {
    for (const capability of CAPABILITIES) {
      expect(canUse(user, capability)).toBe(true)
    }
  })

  test('未ログインには UserId がない（qrcc-api に actor を渡さない）', () => {
    expect(actorUserId(visitor)).toBeUndefined()
  })

  test('ゲストとログイン済みは検証済みの UserId を持つ', () => {
    expect(actorUserId(guest)).toBe(USER_ID)
    expect(actorUserId(user)).toBe(USER_ID)
  })

  test('サインインしているかを一言で判定できる', () => {
    expect(isSignedIn(visitor)).toBe(false)
    expect(isSignedIn(guest)).toBe(true)
    expect(isSignedIn(user)).toBe(true)
  })
})
