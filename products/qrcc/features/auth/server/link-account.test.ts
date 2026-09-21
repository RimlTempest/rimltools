import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { ok, parseUserId } from '@qrcc/contract'
import type { PromotionRecord } from '../core/promote-account.ts'
import { makeHandleLinkAccount } from './link-account.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')

const record: PromotionRecord = {
  fromUserId: GUEST,
  toUserId: GOOGLE,
  movedCodes: 2,
  movedFolders: 0,
  completedAt: new Date('2026-09-01T00:00:00Z'),
}

describe('ゲストが Google で続けたときの連携', () => {
  test('ゲストのデータを新しいアカウントへ移譲する', async () => {
    const calls: { fromUserId: UserId; toUserId: UserId }[] = []
    const handle = makeHandleLinkAccount({
      promote: async (input) => {
        calls.push(input)
        return ok({ kind: 'promoted', record })
      },
      reportFailure: () => {},
    })

    await handle({ anonymousUser: { user: { id: GUEST } }, newUser: { user: { id: GOOGLE } } })

    expect(calls).toEqual([{ fromUserId: GUEST, toUserId: GOOGLE }])
  })

  test('ID の形が違えば移譲しない（別人のデータを動かさない）', async () => {
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      promote: async () => {
        throw new Error('呼ばれてはいけない')
      },
      reportFailure: (detail) => failures.push(detail),
    })

    await handle({ anonymousUser: { user: { id: 'broken' } }, newUser: { user: { id: GOOGLE } } })

    expect(failures).toHaveLength(1)
  })

  test('移譲に失敗しても例外を投げない（サインインまで巻き添えにしない）', async () => {
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      promote: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'D1 down' },
      }),
      reportFailure: (detail) => failures.push(detail),
    })

    await handle({ anonymousUser: { user: { id: GUEST } }, newUser: { user: { id: GOOGLE } } })

    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('storage_unavailable')
  })
})
