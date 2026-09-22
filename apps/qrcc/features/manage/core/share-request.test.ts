import { describe, expect, test } from 'bun:test'
import type { RandomBytes } from '@qrcc/contract'
import { parseCodeId, parseUserId } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import { makeCreateShareDraft } from './share-request.ts'

const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const userId = expectOk(parseUserId('usr_0123456789abcdefghjkmnpq'))
const codeId = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))

const now = () => new Date('2026-09-01T00:00:00.000Z')
/** 決まったバイト列を返す乱数源。テストで発行結果が動かないようにする。 */
const randomBytes: RandomBytes = (byteLength) => new Uint8Array(byteLength).fill(7)

const guest: Actor = {
  kind: 'guest',
  userId,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
}
const user: Actor = { kind: 'user', userId, displayName: '利用者' }

const createShareDraft = makeCreateShareDraft({ now, randomBytes })

describe('共有リンクの発行', () => {
  test('サインイン済みなら閲覧用のリンクを作れる', () => {
    const draft = createShareDraft(user, codeId, {
      permission: 'view',
      expiry: { kind: 'days', days: 30 },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    expect(draft.value.codeId).toBe(codeId)
    expect(draft.value.permission).toBe('view')
    expect(draft.value.expiresAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    // トークンは 32 文字（@qrcc/contract の newShareToken が発行する）
    expect(String(draft.value.token)).toHaveLength(32)
  })

  test('サインイン済みなら期限なしのリンクも作れる', () => {
    const draft = createShareDraft(user, codeId, {
      permission: 'edit',
      expiry: { kind: 'forever' },
    })
    expect(draft.ok).toBe(true)
    if (draft.ok) expect(draft.value.expiresAt).toBeUndefined()
  })

  /** ゲストの制約は @qrcc/auth の share-policy が持つ。ここでは二重に書かない。 */
  test('ゲストは編集できるリンクを作れない', () => {
    const draft = createShareDraft(guest, codeId, {
      permission: 'edit',
      expiry: { kind: 'days', days: 30 },
    })
    expect(draft).toEqual({ ok: false, error: { kind: 'guest_cannot_grant_edit' } })
  })

  test('ゲストは期限なしのリンクを作れない', () => {
    const draft = createShareDraft(guest, codeId, {
      permission: 'view',
      expiry: { kind: 'forever' },
    })
    expect(draft).toEqual({ ok: false, error: { kind: 'guest_cannot_share_forever' } })
  })

  test('未サインインではそもそも作れない', () => {
    const draft = createShareDraft({ kind: 'visitor' }, codeId, {
      permission: 'view',
      expiry: { kind: 'days', days: 30 },
    })
    expect(draft).toEqual({ ok: false, error: { kind: 'sign_in_required' } })
  })

  test('上限を超える期限は断る', () => {
    const draft = createShareDraft(user, codeId, {
      permission: 'view',
      expiry: { kind: 'days', days: 365 },
    })
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.error.kind).toBe('expiry_out_of_range')
  })
})
