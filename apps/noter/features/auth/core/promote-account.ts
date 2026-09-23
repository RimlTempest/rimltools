/**
 * ゲスト（匿名）のデータを Google アカウントへ移譲する（ADR-0010 の中核）。
 *
 * 設計の要点は **冪等性**。OAuth の往復は途中で切れることがあり、ユーザーは
 * 平気でリトライする。二重に移譲したり、移譲済みのデータを別のアカウントへ
 * 横取りさせたりしてはいけない。
 *
 * 判定は `user.promoted_from` 1 列で行う（ADR-0010）。
 *
 *   1. `findPromotion` で「この ゲストは既に誰かへ移譲済みか」を読む（速い枝）
 *   2. `transfer` で `document.owner_id` と `document_member.user_id` を付け替える
 *   3. `markPromoted` で `user.promoted_from` を立てる
 *
 * **2 → 3 の順にする。** 3 で失敗しても、フラグが立っていないのでリトライで
 * 2 からやり直せる（`transfer` は `WHERE owner_id = from` なので何度実行しても同じ）。
 * 逆順にすると、フラグだけ立って文書が置き去りになる状態を作れてしまう。
 * 3 が「別の実行に先を越された」と返したときだけ、宛先が一致するかで
 * 冪等な成功と横取りを振り分ける。
 *
 * I/O はすべて引数で受け取るので、この関数自体は純粋で Small テストで尽くせる。
 * `transfer` は plan 004（`features/documents`）が本物に差し替える。
 */
import type { Result, UserId } from '@noter/contract'
import { err, ok } from '@noter/contract'

/** `user.promoted_from` が指す関係。「to は from から昇格した」。 */
export type PromotionRecord = {
  readonly fromUserId: UserId
  readonly toUserId: UserId
}

export type PromotionIoError = {
  readonly kind: 'storage_unavailable'
  readonly detail: string
}

export type MarkOutcome =
  | { readonly kind: 'marked' }
  /** ユニーク制約に弾かれた = 別の実行が先に記録していた。 */
  | { readonly kind: 'already_recorded'; readonly record: PromotionRecord }

export type PromoteDeps = {
  /** `user.promoted_from = ?` を引き、移譲済みなら誰へ移したかを返す。 */
  readonly findPromotion: (
    fromUserId: UserId,
  ) => Promise<Result<PromotionRecord | undefined, PromotionIoError>>
  /**
   * 文書とメンバーの移譲（`document.owner_id` / `document_member.user_id`）。
   * 何度呼んでも同じ結果になること（`WHERE ... = from` で書く）。
   */
  readonly transfer: (
    fromUserId: UserId,
    toUserId: UserId,
  ) => Promise<Result<void, PromotionIoError>>
  /** `user.promoted_from` を立てる。既に別の実行が立てていたらその記録を返す。 */
  readonly markPromoted: (record: PromotionRecord) => Promise<Result<MarkOutcome, PromotionIoError>>
}

export type PromotionOutcome =
  | { readonly kind: 'promoted'; readonly record: PromotionRecord }
  | { readonly kind: 'already_promoted'; readonly record: PromotionRecord }

export type PromotionError =
  | { readonly kind: 'same_user' }
  | { readonly kind: 'already_promoted_to_other_user'; readonly toUserId: UserId }
  | PromotionIoError

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
  async (record: PromotionRecord): Promise<Result<PromotionOutcome, PromotionError>> => {
    if (record.fromUserId === record.toUserId) return err({ kind: 'same_user' })

    const existing = await deps.findPromotion(record.fromUserId)
    if (!existing.ok) return existing
    if (existing.value !== undefined) return settle(existing.value, record.toUserId)

    const transferred = await deps.transfer(record.fromUserId, record.toUserId)
    if (!transferred.ok) return transferred

    const marked = await deps.markPromoted(record)
    if (!marked.ok) return marked
    if (marked.value.kind === 'already_recorded') {
      return settle(marked.value.record, record.toUserId)
    }
    return ok({ kind: 'promoted', record })
  }

export type PromoteGuestAccount = ReturnType<typeof makePromoteGuestAccount>
