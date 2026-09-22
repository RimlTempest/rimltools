import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { PromoteDeps, PromotionRecord } from './promote-account.ts'
import { makePromoteGuestAccount } from './promote-account.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')
const OTHER = asUserId('usr_2222222222222222222222zz')

/** `user.promoted_from` を持つだけの、動く D1 の代わり。 */
const workingDeps = () => {
  const transfers: PromotionRecord[] = []
  const marks: PromotionRecord[] = []
  const stored: PromotionRecord[] = []
  const deps: PromoteDeps = {
    findPromotion: async (fromUserId) => ({
      ok: true,
      value: stored.find((record) => record.fromUserId === fromUserId),
    }),
    transfer: async (fromUserId, toUserId) => {
      transfers.push({ fromUserId, toUserId })
      return { ok: true, value: undefined }
    },
    markPromoted: async (record) => {
      marks.push(record)
      const found = stored.find((entry) => entry.fromUserId === record.fromUserId)
      if (found !== undefined)
        return { ok: true, value: { kind: 'already_recorded', record: found } }
      stored.push(record)
      return { ok: true, value: { kind: 'marked' } }
    },
  }
  return { deps, transfers, marks, stored }
}

describe('ゲスト → Google のアカウント昇格', () => {
  test('初回は文書を移し、promoted_from を立てる', async () => {
    const { deps, transfers, marks, stored } = workingDeps()

    const result = await makePromoteGuestAccount(deps)({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: true,
      value: { kind: 'promoted', record: { fromUserId: GUEST, toUserId: GOOGLE } },
    })
    expect(transfers).toEqual([{ fromUserId: GUEST, toUserId: GOOGLE }])
    expect(marks).toHaveLength(1)
    expect(stored).toEqual([{ fromUserId: GUEST, toUserId: GOOGLE }])
  })

  test('promoted_from が既に立っていれば transfer を呼ばない', async () => {
    const transfers: PromotionRecord[] = []
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: { fromUserId: GUEST, toUserId: GOOGLE } }),
      transfer: async (fromUserId, toUserId) => {
        transfers.push({ fromUserId, toUserId })
        return { ok: true, value: undefined }
      },
      markPromoted: async () => {
        throw new Error('呼ばれてはいけない')
      },
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: true,
      value: { kind: 'already_promoted', record: { fromUserId: GUEST, toUserId: GOOGLE } },
    })
    expect(transfers).toEqual([])
  })

  test('同じ from/to で 2 回呼んでも transfer は 1 回（冪等）', async () => {
    const { deps, transfers } = workingDeps()
    const promote = makePromoteGuestAccount(deps)

    await promote({ fromUserId: GUEST, toUserId: GOOGLE })
    const retried = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(retried.ok).toBe(true)
    if (retried.ok) expect(retried.value.kind).toBe('already_promoted')
    expect(transfers).toHaveLength(1)
  })

  test('移すものが無くてもフラグは立てる（立てないとリトライのたびに走る）', async () => {
    const { deps, marks } = workingDeps()

    const result = await makePromoteGuestAccount(deps)({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(true)
    expect(marks).toHaveLength(1)
  })

  test('同時実行で相手が先に記録していたら、移譲済みとして扱う', async () => {
    const promote = makePromoteGuestAccount({
      // 読んだ時点では未移譲。書く直前に別の実行が完了した状況
      findPromotion: async () => ({ ok: true, value: undefined }),
      transfer: async () => ({ ok: true, value: undefined }),
      markPromoted: async () => ({
        ok: true,
        value: { kind: 'already_recorded', record: { fromUserId: GUEST, toUserId: GOOGLE } },
      }),
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.kind).toBe('already_promoted')
  })

  test('別のアカウントへ移譲済みなら断る（横取りさせない）', async () => {
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: { fromUserId: GUEST, toUserId: OTHER } }),
      transfer: async () => {
        throw new Error('呼ばれてはいけない')
      },
      markPromoted: async () => {
        throw new Error('呼ばれてはいけない')
      },
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: false,
      error: { kind: 'already_promoted_to_other_user', toUserId: OTHER },
    })
  })

  test('同じユーザーへの移譲は断る', async () => {
    const { deps, transfers } = workingDeps()

    const result = await makePromoteGuestAccount(deps)({ fromUserId: GUEST, toUserId: GUEST })

    expect(result).toEqual({ ok: false, error: { kind: 'same_user' } })
    expect(transfers).toHaveLength(0)
  })

  test('記録を読めなければ移さない（I/O の失敗は値で返す）', async () => {
    const transfers: PromotionRecord[] = []
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'D1 down' },
      }),
      transfer: async (fromUserId, toUserId) => {
        transfers.push({ fromUserId, toUserId })
        return { ok: true, value: undefined }
      },
      markPromoted: async () => ({ ok: true, value: { kind: 'marked' } }),
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('storage_unavailable')
    expect(transfers).toHaveLength(0)
  })

  test('付け替えに失敗したらフラグを立てず、理由をそのまま返す', async () => {
    const marks: PromotionRecord[] = []
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: undefined }),
      transfer: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'batch failed' },
      }),
      markPromoted: async (record) => {
        marks.push(record)
        return { ok: true, value: { kind: 'marked' } }
      },
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: false,
      error: { kind: 'storage_unavailable', detail: 'batch failed' },
    })
    // フラグが立たないので、次のリトライで付け替えからやり直せる
    expect(marks).toHaveLength(0)
  })

  test('フラグを立てられなければ失敗として返す', async () => {
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: undefined }),
      transfer: async () => ({ ok: true, value: undefined }),
      markPromoted: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'update failed' },
      }),
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: false,
      error: { kind: 'storage_unavailable', detail: 'update failed' },
    })
  })
})
