/**
 * `PromoteDeps` の D1 実装（ADR-0010）。
 *
 * 判定の材料は `user.promoted_from` 1 列だけ。
 *
 *   - `findPromotion(from)` … `promoted_from = from` の行 = 移譲先のアカウント
 *   - `markPromoted({from, to})` … `promoted_from IS NULL` の行だけを更新する。
 *     0 行なら「その to は既に別のゲストから昇格済み」、
 *     ユニーク制約違反なら「その from は既に別の to に取られた」。
 *     どちらも現状を読み直して呼び出し側に判断させる（例外文字列を読まない）。
 *
 * `transfer`（document / document_member の付け替え）はここに無い。
 * plan 004 が `features/documents` 側で実装して composition root で差し込む。
 */
import type { Result, UserId } from '@noter/contract'
import { err, ok, parseUserId } from '@noter/contract'
import type { MarkOutcome, PromotionIoError, PromotionRecord } from '../core/promote-account.ts'
import type { SqlRow, SqlRunner } from './sql.ts'

export type PromotionStore = {
  readonly findPromotion: (
    fromUserId: UserId,
  ) => Promise<Result<PromotionRecord | undefined, PromotionIoError>>
  readonly markPromoted: (record: PromotionRecord) => Promise<Result<MarkOutcome, PromotionIoError>>
}

const SELECT_BY_FROM = 'SELECT id FROM "user" WHERE promoted_from = ? LIMIT 1'
const SELECT_BY_TO = 'SELECT promoted_from FROM "user" WHERE id = ? LIMIT 1'
const MARK = 'UPDATE "user" SET promoted_from = ? WHERE id = ? AND promoted_from IS NULL'

const readText = (row: SqlRow, key: string): string => {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

const corrupted = (detail: string): PromotionIoError => ({
  kind: 'storage_unavailable',
  detail: `user.promoted_from が壊れている: ${detail}`,
})

export const makePromotionStore = (runner: SqlRunner): PromotionStore => {
  /** `promoted_from = from` の行から「誰へ移したか」を読む。 */
  const findPromotion = async (
    fromUserId: UserId,
  ): Promise<Result<PromotionRecord | undefined, PromotionIoError>> => {
    const rows = await runner.all({ sql: SELECT_BY_FROM, params: [fromUserId] })
    if (!rows.ok) return rows
    const row = rows.value[0]
    if (row === undefined) return ok(undefined)
    const toUserId = parseUserId(readText(row, 'id'))
    if (!toUserId.ok) return err(corrupted(`id=${readText(row, 'id')}`))
    return ok({ fromUserId, toUserId: toUserId.value })
  }

  /** 更新できなかったときに「なぜ」を読み直す。 */
  const explainNoChange = async (
    record: PromotionRecord,
  ): Promise<Result<MarkOutcome, PromotionIoError>> => {
    const rows = await runner.all({ sql: SELECT_BY_TO, params: [record.toUserId] })
    if (!rows.ok) return rows
    const promotedFrom = parseUserId(readText(rows.value[0] ?? {}, 'promoted_from'))
    if (promotedFrom.ok) {
      // to は既に（別の、または同じ）ゲストから昇格済み
      return ok({
        kind: 'already_recorded',
        record: { fromUserId: promotedFrom.value, toUserId: record.toUserId },
      })
    }
    // to には何も立っていない = from が別のアカウントに取られている
    const claimed = await findPromotion(record.fromUserId)
    if (!claimed.ok) return claimed
    if (claimed.value === undefined) {
      return err({
        kind: 'storage_unavailable',
        detail: `promoted_from を記録できなかった（to=${record.toUserId} が見つからない）`,
      })
    }
    return ok({ kind: 'already_recorded', record: claimed.value })
  }

  const markPromoted = async (
    record: PromotionRecord,
  ): Promise<Result<MarkOutcome, PromotionIoError>> => {
    const changed = await runner.run({
      sql: MARK,
      params: [record.fromUserId, record.toUserId],
    })
    // ユニーク制約違反（別のアカウントが同じ from を取った）も 0 行と同じ扱いにし、
    // 現状を読み直して判断する
    if (!changed.ok || changed.value === 0) return explainNoChange(record)
    return ok({ kind: 'marked' })
  }

  return { findPromotion, markPromoted }
}
