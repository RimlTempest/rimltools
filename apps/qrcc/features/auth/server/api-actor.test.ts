import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import { apiActorOptions, readEnvString } from './api-actor.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')

describe('qrcc-api に渡す actor', () => {
  test('未ログインなら actor を付けない（キーごと作らない）', () => {
    expect(apiActorOptions({ kind: 'visitor' })).toEqual({})
  })

  test('ゲストも検証済みの UserId として渡す', () => {
    expect(
      apiActorOptions({
        kind: 'guest',
        userId: USER_ID,
        displayName: 'ゲスト',
        sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
      }),
    ).toEqual({ actor: USER_ID })
  })

  test('サインイン済みユーザーの UserId を渡す', () => {
    expect(apiActorOptions({ kind: 'user', userId: USER_ID, displayName: 'りむ' })).toEqual({
      actor: USER_ID,
    })
  })
})

describe('env の読み出し', () => {
  test('文字列ならそのまま返す', () => {
    expect(readEnvString({ BETTER_AUTH_SECRET: 'shh' }, 'BETTER_AUTH_SECRET')).toBe('shh')
  })

  test('未設定・型違い・env なしはすべて空文字にする', () => {
    expect(readEnvString({}, 'GOOGLE_CLIENT_ID')).toBe('')
    expect(readEnvString({ GOOGLE_CLIENT_ID: 42 }, 'GOOGLE_CLIENT_ID')).toBe('')
    expect(readEnvString(undefined, 'GOOGLE_CLIENT_ID')).toBe('')
  })
})
