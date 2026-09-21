/**
 * ゲスト → Google の移譲を D1 で行う部分（`PromoteDeps` の I/O 実装）。
 *
 * 冪等性の要は **「記録の INSERT を先に、1 トランザクションで」** という順序:
 *
 *   1. `INSERT ... ON CONFLICT DO NOTHING` で移譲済みフラグを立てる。
 *      件数はこの時点で数える（まだデータはゲストのもの）
 *   2. 同じトランザクションで所有者を付け替える
 *
 * 1 が競合で 0 行なら「別の実行が先に完了した」と分かる。例外文字列を
 * 読んで判定しない。2 は既に移譲済みなら 0 行に当たるだけで無害。
 *
 * `code` / `folder` は feat/manage が作るテーブルなので、まだ存在しない
 * 場合がある。存在するものだけを対象にする（無ければ移すものがないだけ）。
 */
import type { Result, UserId } from '@qrcc/contract'
import { err, ok, parseUserId } from '@qrcc/contract'
import type {
  PromotionIoError,
  PromotionRecord,
  TransferOutcome,
  TransferPlan,
} from '../core/promote-account.ts'
import type { SqlError, SqlRow, SqlRunner, SqlStatement, SqlValue } from './sql.ts'

/** 所有者列を持つテーブル。ここに 1 行足せば移譲対象が増える（OCP）。 */
const OWNED_TABLES = [
  { table: 'code', ownerColumn: 'owner_id' },
  { table: 'folder', ownerColumn: 'owner_id' },
] as const

type OwnedTable = (typeof OWNED_TABLES)[number]['table']

export type PromotionStore = {
  readonly findPromotion: (
    fromUserId: UserId,
  ) => Promise<Result<PromotionRecord | undefined, PromotionIoError>>
  readonly transferOwnership: (
    plan: TransferPlan,
  ) => Promise<Result<TransferOutcome, PromotionIoError>>
}

const readNumber = (row: SqlRow, key: string): number => {
  const value = row[key]
  return typeof value === 'number' ? value : 0
}

const readText = (row: SqlRow, key: string): string => {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

const corrupted = (detail: string): PromotionIoError => ({
  kind: 'storage_unavailable',
  detail: `account_promotion の記録が壊れている: ${detail}`,
})

const toRecord = (row: SqlRow): Result<PromotionRecord, PromotionIoError> => {
  const fromUserId = parseUserId(readText(row, 'from_user_id'))
  const toUserId = parseUserId(readText(row, 'to_user_id'))
  if (!fromUserId.ok) return err(corrupted(`from_user_id=${readText(row, 'from_user_id')}`))
  if (!toUserId.ok) return err(corrupted(`to_user_id=${readText(row, 'to_user_id')}`))
  return ok({
    fromUserId: fromUserId.value,
    toUserId: toUserId.value,
    movedCodes: readNumber(row, 'moved_codes'),
    movedFolders: readNumber(row, 'moved_folders'),
    // 日時は Unix 秒で持つ（Drizzle の timestamp モードに合わせる）
    completedAt: new Date(readNumber(row, 'completed_at') * 1000),
  })
}

const SELECT_PROMOTION = 'SELECT * FROM account_promotion WHERE from_user_id = ?'

export const makePromotionStore = (runner: SqlRunner): PromotionStore => {
  const findRow = async (fromUserId: UserId): Promise<Result<SqlRow | undefined, SqlError>> => {
    const rows = await runner.all({ sql: SELECT_PROMOTION, params: [fromUserId] })
    return rows.ok ? ok(rows.value[0]) : rows
  }

  const findPromotion = async (
    fromUserId: UserId,
  ): Promise<Result<PromotionRecord | undefined, PromotionIoError>> => {
    const row = await findRow(fromUserId)
    if (!row.ok) return row
    if (row.value === undefined) return ok(undefined)
    return toRecord(row.value)
  }

  /** まだ存在しないテーブルを SQL に混ぜない。 */
  const existingOwnedTables = async (): Promise<Result<readonly OwnedTable[], SqlError>> => {
    const rows = await runner.all({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${OWNED_TABLES.map(
        () => '?',
      ).join(', ')})`,
      params: OWNED_TABLES.map((owned) => owned.table),
    })
    if (!rows.ok) return rows
    const present = new Set(rows.value.map((row) => readText(row, 'name')))
    return ok(OWNED_TABLES.filter((owned) => present.has(owned.table)).map((owned) => owned.table))
  }

  const countExpression = (
    owned: OwnedTable,
    present: readonly OwnedTable[],
    params: SqlValue[],
    fromUserId: UserId,
  ): string => {
    if (!present.includes(owned)) return '0'
    params.push(fromUserId)
    const column = OWNED_TABLES.find((entry) => entry.table === owned)?.ownerColumn ?? 'owner_id'
    return `(SELECT COUNT(*) FROM ${owned} WHERE ${column} = ?)`
  }

  const transferOwnership = async (
    plan: TransferPlan,
  ): Promise<Result<TransferOutcome, PromotionIoError>> => {
    const present = await existingOwnedTables()
    if (!present.ok) return present

    const insertParams: SqlValue[] = [plan.fromUserId, plan.toUserId]
    const codes = countExpression('code', present.value, insertParams, plan.fromUserId)
    const folders = countExpression('folder', present.value, insertParams, plan.fromUserId)
    insertParams.push(Math.floor(plan.at.getTime() / 1000))

    const statements: SqlStatement[] = [
      {
        sql:
          'INSERT INTO account_promotion (from_user_id, to_user_id, moved_codes, moved_folders, completed_at) '
          + `VALUES (?, ?, ${codes}, ${folders}, ?) ON CONFLICT (from_user_id) DO NOTHING`,
        params: insertParams,
      },
      ...present.value.map((owned): SqlStatement => {
        const column =
          OWNED_TABLES.find((entry) => entry.table === owned)?.ownerColumn ?? 'owner_id'
        return {
          sql: `UPDATE ${owned} SET ${column} = ? WHERE ${column} = ?`,
          params: [plan.toUserId, plan.fromUserId],
        }
      }),
    ]

    const changes = await runner.batch(statements)
    if (!changes.ok) return changes

    const row = await findRow(plan.fromUserId)
    if (!row.ok) return row
    if (row.value === undefined) {
      return err({
        kind: 'storage_unavailable',
        detail: '移譲を記録できなかった（account_promotion に行がない）',
      })
    }
    const record = toRecord(row.value)
    if (!record.ok) return record

    // 記録を書けたのがこの実行なら「移譲した」、そうでなければ誰かが先に完了していた
    return (changes.value[0] ?? 0) > 0
      ? ok({
          kind: 'transferred',
          movedCodes: record.value.movedCodes,
          movedFolders: record.value.movedFolders,
        })
      : ok({ kind: 'already_recorded', record: record.value })
  }

  return { findPromotion, transferOwnership }
}
