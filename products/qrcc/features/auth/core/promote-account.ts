/**
 * ゲスト（匿名）ユーザーのデータを Google アカウントへ移譲する（ADR-0004 の中核）。
 *
 * 設計の要点は **冪等性**。OAuth のコールバックは往復の途中で切れることがあり、
 * ユーザーは平気でリトライする。二重に移譲したり、移譲済みのデータを
 * 別のアカウントへ横取りさせたりしてはいけない。
 *
 * そのために、
 *   1. 移譲前に「移譲済みフラグ」を読む（速い枝）
 *   2. 付け替えとフラグの記録は **1 トランザクション**で行う（`transferOwnership`）
 *   3. 競合してフラグが先に立っていたら、それを成功として扱う（遅い枝）
 * の 3 段構えにする。1 だけでは競合を防げず、2 だけではリトライのたびに
 * トランザクションを張ることになる。
 *
 * I/O はすべて引数で受け取るので、この関数自体は純粋で Small テストで尽くせる。
 */
import type { Result, UserId } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'

/** 移譲済みフラグの中身。 */
export type PromotionRecord = {
  readonly fromUserId: UserId
  readonly toUserId: UserId
  readonly movedCodes: number
  readonly movedFolders: number
  readonly completedAt: Date
}

/** 1 トランザクションで行う付け替えの指示。 */
export type TransferPlan = {
  readonly fromUserId: UserId
  readonly toUserId: UserId
  readonly at: Date
}

export type TransferOutcome =
  | {
      readonly kind: 'transferred'
      readonly movedCodes: number
      readonly movedFolders: number
    }
  /** 主キー制約に弾かれた = 別の実行が先に完了していた。 */
  | { readonly kind: 'already_recorded'; readonly record: PromotionRecord }

export type PromotionIoError = {
  readonly kind: 'storage_unavailable'
  readonly detail: string
}

export type PromoteDeps = {
  readonly findPromotion: (
    fromUserId: UserId,
  ) => Promise<Result<PromotionRecord | undefined, PromotionIoError>>
  /**
   * 所有権の付け替えと移譲済みフラグの記録を**まとめて**行う。
   * 分けて呼べる形にしない。片方だけ成功する余地を残さないため。
   */
  readonly transferOwnership: (
    plan: TransferPlan,
  ) => Promise<Result<TransferOutcome, PromotionIoError>>
  readonly now: () => Date
}

export type PromotionOutcome =
  | { readonly kind: 'promoted'; readonly record: PromotionRecord }
  | { readonly kind: 'already_promoted'; readonly record: PromotionRecord }

export type PromotionError =
  | { readonly kind: 'same_user' }
  | { readonly kind: 'already_promoted_to_other_user'; readonly toUserId: UserId }
  | PromotionIoError

export type PromoteInput = {
  readonly fromUserId: UserId
  readonly toUserId: UserId
}

/** 記録済みの移譲を、宛先が一致するかで「冪等な成功」と「横取り」に振り分ける。 */
const settle = (
  found: PromotionRecord,
  toUserId: UserId,
): Result<PromotionOutcome, PromotionError> =>
  found.toUserId === toUserId
    ? ok({ kind: 'already_promoted', record: found })
    : err({ kind: 'already_promoted_to_other_user', toUserId: found.toUserId })

export const makePromoteGuestAccount =
  (deps: PromoteDeps) =>
  async (input: PromoteInput): Promise<Result<PromotionOutcome, PromotionError>> => {
    if (input.fromUserId === input.toUserId) return err({ kind: 'same_user' })

    const existing = await deps.findPromotion(input.fromUserId)
    if (!existing.ok) return existing
    if (existing.value !== undefined) return settle(existing.value, input.toUserId)

    const at = deps.now()
    const transferred = await deps.transferOwnership({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      at,
    })
    if (!transferred.ok) return transferred

    if (transferred.value.kind === 'already_recorded') {
      return settle(transferred.value.record, input.toUserId)
    }
    return ok({
      kind: 'promoted',
      record: {
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        movedCodes: transferred.value.movedCodes,
        movedFolders: transferred.value.movedFolders,
        completedAt: at,
      },
    })
  }

export type PromoteGuestAccount = ReturnType<typeof makePromoteGuestAccount>
