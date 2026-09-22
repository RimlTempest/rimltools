import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { Actor } from './actor.ts'
import type { ShareLinkRequest } from './share-policy.ts'
import {
  MAX_SHARE_DAYS,
  SHARE_DAYS_DEFAULT,
  authorizeShareLink,
  describeShareDenial,
} from './share-policy.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')
const NOW = new Date('2026-09-01T00:00:00Z')
const authorize = authorizeShareLink(() => NOW)

const visitor: Actor = { kind: 'visitor' }
const guest: Actor = {
  kind: 'guest',
  userId: USER_ID,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
}
const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }

const view: ShareLinkRequest = { permission: 'view', expiry: { kind: 'days', days: 30 } }

describe('共有リンクの発行可否', () => {
  test('未ログインは共有リンクを作れない', () => {
    const result = authorize(visitor, view)
    expect(result).toEqual({ ok: false, error: { kind: 'sign_in_required' } })
  })

  test('ゲストは閲覧用の共有リンクを作れる', () => {
    const result = authorize(guest, view)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.permission).toBe('view')
      expect(result.value.expiresAt).toEqual(new Date('2026-10-01T00:00:00Z'))
      expect(result.value.ownerId).toBe(USER_ID)
    }
  })

  test('ゲストは編集権限の共有リンクを作れない（ADR-0004）', () => {
    const result = authorize(guest, { permission: 'edit', expiry: { kind: 'days', days: 7 } })
    expect(result).toEqual({ ok: false, error: { kind: 'guest_cannot_grant_edit' } })
  })

  test('ゲストは無期限の共有リンクを作れない（ADR-0004）', () => {
    const result = authorize(guest, { permission: 'view', expiry: { kind: 'forever' } })
    expect(result).toEqual({ ok: false, error: { kind: 'guest_cannot_share_forever' } })
  })

  test('ログイン済みユーザーは編集権限も無期限も作れる', () => {
    const result = authorize(user, { permission: 'edit', expiry: { kind: 'forever' } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.permission).toBe('edit')
      expect(result.value.expiresAt).toBeUndefined()
    }
  })

  test('期限は最長 90 日まで', () => {
    expect(
      authorize(user, { permission: 'view', expiry: { kind: 'days', days: MAX_SHARE_DAYS } }).ok,
    ).toBe(true)
    const tooLong = authorize(user, {
      permission: 'view',
      expiry: { kind: 'days', days: MAX_SHARE_DAYS + 1 },
    })
    expect(tooLong).toEqual({
      ok: false,
      error: { kind: 'expiry_out_of_range', max: MAX_SHARE_DAYS, actual: MAX_SHARE_DAYS + 1 },
    })
  })

  test('0 日以下の期限は受け付けない（作った瞬間に切れるリンクを作らせない）', () => {
    const result = authorize(user, { permission: 'view', expiry: { kind: 'days', days: 0 } })
    expect(result.ok).toBe(false)
  })

  test('既定の期限は 30 日', () => {
    expect(SHARE_DAYS_DEFAULT).toBe(30)
    const result = authorize(guest, {
      permission: 'view',
      expiry: { kind: 'days', days: SHARE_DAYS_DEFAULT },
    })
    expect(result.ok).toBe(true)
  })

  test('断られた理由は画面に出せる日本語になる', () => {
    const denied = authorize(guest, { permission: 'edit', expiry: { kind: 'forever' } })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(describeShareDenial(denied.error)).toContain('編集')
  })
})
