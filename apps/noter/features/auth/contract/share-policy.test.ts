import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { ROLES, parseUserId } from '@noter/contract'
import type { Actor } from './actor.ts'
import {
  SHARE_ROLES,
  allowedShareRoles,
  canGrantShareRole,
  describeShareRoleDenial,
  shareRoleDenial,
} from './share-policy.ts'

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

describe('共有リンクに載せられる権限', () => {
  test('visitor は共有リンクを作れない', () => {
    expect(allowedShareRoles(visitor)).toEqual([])
  })

  test('ゲストは閲覧リンクだけ作れる（ADR-0010）', () => {
    expect(allowedShareRoles(guest)).toEqual(['viewer'])
  })

  test('Google でログイン済みなら編集リンクも作れる', () => {
    expect(allowedShareRoles(user)).toEqual(['viewer', 'editor'])
  })

  test('owner はリンクでは渡せない（ADR-0011）', () => {
    expect(SHARE_ROLES).toEqual(['viewer', 'editor'])
    expect(SHARE_ROLES).not.toContain('owner')
    // Role から派生しているので、ロールが増えたらここが落ちて気づける
    expect(ROLES.filter((role) => role !== 'owner').toSorted()).toEqual(SHARE_ROLES.toSorted())
  })

  test('canGrantShareRole は allowedShareRoles と一致する', () => {
    for (const actor of [visitor, guest, user]) {
      for (const role of SHARE_ROLES) {
        expect(canGrantShareRole(actor, role)).toBe(allowedShareRoles(actor).includes(role))
      }
    }
  })

  test('許可されているときは断る理由がない', () => {
    expect(shareRoleDenial(guest, 'viewer')).toBeUndefined()
    expect(shareRoleDenial(user, 'editor')).toBeUndefined()
  })

  test('ゲストの editor リンクは理由つきで断る', () => {
    const denied = shareRoleDenial(guest, 'editor')
    expect(denied).toEqual({ kind: 'guest_cannot_grant_editor' })
    if (denied !== undefined) {
      const message = describeShareRoleDenial(denied)
      expect(message).toContain('編集')
      expect(message).toContain('引き継')
    }
  })

  test('visitor はログインを促す', () => {
    const denied = shareRoleDenial(visitor, 'viewer')
    expect(denied).toEqual({ kind: 'sign_in_required' })
    if (denied !== undefined) expect(describeShareRoleDenial(denied)).toContain('ゲスト')
  })
})
