/**
 * `DurableObjectStorage` を core の `RoomStorage` に合わせるアダプタ。
 *
 * core は Workers の型を知らない（`features/sync/core/src/ports.ts`）ので、
 * 必要なメンバーだけをここで橋渡しする。
 */
import type { RoomStorage, SqlValue } from '../core/src/ports.ts'

export const makeRoomStorage = (storage: DurableObjectStorage): RoomStorage => ({
  sql: {
    exec: (query: string, ...bindings: readonly SqlValue[]) => storage.sql.exec(query, ...bindings),
  },
  getAlarm: () => storage.getAlarm(),
  setAlarm: async (at: number) => {
    await storage.setAlarm(at)
  },
  deleteAll: () => storage.deleteAll(),
})
