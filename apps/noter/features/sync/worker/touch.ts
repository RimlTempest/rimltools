/**
 * D1 の `document.updated_at` を触る（`docs/realtime-protocol.md` §4）。
 *
 * 一覧の並び順のためだけの更新なので、**60 秒に 1 回**で十分。
 * D1 の行書き込みも無料枠の資源なので、編集のたびには書かない。
 */
import { TOUCH_THROTTLE_MS } from '@noter/sync/contract'

const UPDATE_SQL = 'UPDATE document SET updated_at = ?1 WHERE id = ?2'

/**
 * @param documentId DO の名前（`ctx.id.name`）。`idFromName` 以外で作られた DO では
 *   名前が無いので、その場合は何もしない。
 */
export const makeTouch = (
  db: D1Database,
  documentId: string | undefined,
): ((updatedAt: number) => Promise<void>) => {
  let lastTouchedAt = 0

  return async (updatedAt: number): Promise<void> => {
    if (documentId === undefined || documentId.length === 0) return
    if (updatedAt - lastTouchedAt < TOUCH_THROTTLE_MS) return
    lastTouchedAt = updatedAt

    try {
      await db.prepare(UPDATE_SQL).bind(updatedAt, documentId).run()
    } catch {
      // document テーブルは plan 004 まで存在しない。失敗しても編集を止めない（ADR-0005）。
      // I/O 境界なので try/catch を使ってよい唯一の層（rimltools-typescript §3）。
    }
  }
}
