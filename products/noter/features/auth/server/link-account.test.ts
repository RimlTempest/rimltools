import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { PromotionRecord } from '../core/promote-account.ts'
import { makeHandleLinkAccount } from './link-account.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')

const linked = (from: string, to: string) => ({
  anonymousUser: { user: { id: from } },
  newUser: { user: { id: to } },
})

describe('ゲスト → Google の連携フック', () => {
  test('検証済みの UserId で移譲を呼ぶ', async () => {
    const calls: PromotionRecord[] = []
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      promote: async (record) => {
        calls.push(record)
        return { ok: true, value: { kind: 'promoted', record } }
      },
      reportFailure: (detail) => failures.push(detail),
    })

    await handle(linked(GUEST, GOOGLE))

    expect(calls).toEqual([{ fromUserId: GUEST, toUserId: GOOGLE }])
    expect(failures).toEqual([])
  })

  test('ID の形が違えば移譲せず記録に残す', async () => {
    const calls: PromotionRecord[] = []
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      promote: async (record) => {
        calls.push(record)
        return { ok: true, value: { kind: 'promoted', record } }
      },
      reportFailure: (detail) => failures.push(detail),
    })

    await handle(linked('anon-123', GOOGLE))

    expect(calls).toEqual([])
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('anon-123')
  })

  test('移譲に失敗してもログインを止めない（投げない）', async () => {
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      promote: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'D1 down' },
      }),
      reportFailure: (detail) => failures.push(detail),
    })

    // 投げたらログインごと失敗する
    await handle(linked(GUEST, GOOGLE))

    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('storage_unavailable')
  })
})
