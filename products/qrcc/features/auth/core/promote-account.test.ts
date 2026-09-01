import { describe, expect, test } from 'bun:test'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { PromoteDeps, PromotionRecord, TransferPlan } from './promote-account.ts'
import { makePromoteGuestAccount } from './promote-account.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const GUEST = asUserId('usr_0123456789abcdefghjkmnpq')
const GOOGLE = asUserId('usr_qpnmkjhgfedcba9876543210')
const OTHER = asUserId('usr_2222222222222222222222zz')
const NOW = new Date('2026-09-01T12:00:00Z')

const record = (overrides: Partial<PromotionRecord> = {}): PromotionRecord => ({
  fromUserId: GUEST,
  toUserId: GOOGLE,
  movedCodes: 3,
  movedFolders: 1,
  completedAt: NOW,
  ...overrides,
})

/** 移譲元にデータが 3 件あり、まだ移譲していない状態のフェイク。 */
const workingDeps = () => {
  const plans: TransferPlan[] = []
  const stored: PromotionRecord[] = []
  const deps: PromoteDeps = {
    findPromotion: async (fromUserId) => ({
      ok: true,
      value: stored.find((r) => r.fromUserId === fromUserId),
    }),
    transferOwnership: async (plan) => {
      plans.push(plan)
      stored.push({
        ...record(),
        fromUserId: plan.fromUserId,
        toUserId: plan.toUserId,
        completedAt: plan.at,
      })
      return { ok: true, value: { kind: 'transferred', movedCodes: 3, movedFolders: 1 } }
    },
    now: () => NOW,
  }
  return { deps, plans, stored }
}

describe('ゲスト → Google のアカウント昇格', () => {
  test('初回はデータを移し、移譲済みとして記録する', async () => {
    const { deps, plans } = workingDeps()
    const promote = makePromoteGuestAccount(deps)

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.kind).toBe('promoted')
      expect(result.value.record.movedCodes).toBe(3)
      expect(result.value.record.movedFolders).toBe(1)
    }
    expect(plans).toEqual([{ fromUserId: GUEST, toUserId: GOOGLE, at: NOW }])
  })

  test('リトライしても二重に移さない（冪等）', async () => {
    const { deps, plans } = workingDeps()
    const promote = makePromoteGuestAccount(deps)

    await promote({ fromUserId: GUEST, toUserId: GOOGLE })
    const retried = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(retried.ok).toBe(true)
    if (retried.ok) expect(retried.value.kind).toBe('already_promoted')
    // 2 回目は付け替えを試みてすらいない
    expect(plans).toHaveLength(1)
  })

  test('移譲元にデータがなくても完了として記録する', async () => {
    const plans: TransferPlan[] = []
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: undefined }),
      transferOwnership: async (plan) => {
        plans.push(plan)
        return { ok: true, value: { kind: 'transferred', movedCodes: 0, movedFolders: 0 } }
      },
      now: () => NOW,
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.kind).toBe('promoted')
      expect(result.value.record.movedCodes).toBe(0)
    }
    // 移すものがなくてもフラグは立てる。立てないとリトライのたびに走る
    expect(plans).toHaveLength(1)
  })

  test('同時実行で相手が先に記録していたら、移譲済みとして扱う', async () => {
    const promote = makePromoteGuestAccount({
      // 読んだ時点では未移譲。書く直前に別の実行が完了した状況
      findPromotion: async () => ({ ok: true, value: undefined }),
      transferOwnership: async () => ({
        ok: true,
        value: { kind: 'already_recorded', record: record() },
      }),
      now: () => NOW,
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.kind).toBe('already_promoted')
  })

  test('別のアカウントへ移譲済みなら断る（横取りさせない）', async () => {
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: record({ toUserId: OTHER }) }),
      transferOwnership: async () => {
        throw new Error('呼ばれてはいけない')
      },
      now: () => NOW,
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: false,
      error: { kind: 'already_promoted_to_other_user', toUserId: OTHER },
    })
  })

  test('同じユーザーへの移譲は断る', async () => {
    const { deps, plans } = workingDeps()
    const promote = makePromoteGuestAccount(deps)

    const result = await promote({ fromUserId: GUEST, toUserId: GUEST })

    expect(result).toEqual({ ok: false, error: { kind: 'same_user' } })
    expect(plans).toHaveLength(0)
  })

  test('記録を読めなければ移さない（I/O の失敗は値で返す）', async () => {
    const plans: TransferPlan[] = []
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'D1 down' },
      }),
      transferOwnership: async (plan) => {
        plans.push(plan)
        return { ok: true, value: { kind: 'transferred', movedCodes: 0, movedFolders: 0 } }
      },
      now: () => NOW,
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('storage_unavailable')
    expect(plans).toHaveLength(0)
  })

  test('付け替えに失敗したら理由をそのまま返す', async () => {
    const promote = makePromoteGuestAccount({
      findPromotion: async () => ({ ok: true, value: undefined }),
      transferOwnership: async () => ({
        ok: false,
        error: { kind: 'storage_unavailable', detail: 'batch failed' },
      }),
      now: () => NOW,
    })

    const result = await promote({ fromUserId: GUEST, toUserId: GOOGLE })

    expect(result).toEqual({
      ok: false,
      error: { kind: 'storage_unavailable', detail: 'batch failed' },
    })
  })

  test('完了時刻は注入した時計から来る', async () => {
    const { deps } = workingDeps()
    const result = await makePromoteGuestAccount(deps)({ fromUserId: GUEST, toUserId: GOOGLE })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.record.completedAt).toEqual(NOW)
  })
})
