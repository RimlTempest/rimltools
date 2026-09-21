/**
 * 永続化のタイミングを決める（ADR-0005）。
 *
 * 更新のたびに書くと DO SQLite の行書き込み（100k/日）が数分で枯れる。
 * `markDirty()` は alarm を **1 本だけ**張り、その間に来た更新をまとめる。
 *
 * **JS のタイマー API は使わない。** タイマーを持つ DO は hibernation できない（ADR-0003）。
 * 遅延は `storage.setAlarm` に寄せる。
 */
import { PERSIST_BACKOFF_MAX_MS, PERSIST_DELAY_MS } from '@noter/sync/contract'
import type { RoomStorage } from './ports.ts'

export type PersistSchedulerDeps = {
  readonly storage: RoomStorage
  readonly now: () => number
  /** 実際の書き込み。失敗は reject で表す（I/O 境界の作法）。 */
  readonly persist: () => Promise<void>
}

export type PersistScheduler = {
  /** 未保存の更新があることを記録し、必要なら alarm を張る。 */
  readonly markDirty: () => Promise<void>
  readonly onAlarm: () => Promise<void>
  /** alarm を待たずに書く。最後のソケットが閉じたときに使う。 */
  readonly flush: () => Promise<void>
}

const FIRST_BACKOFF_MS = 1_000

export const makePersistScheduler = (deps: PersistSchedulerDeps): PersistScheduler => {
  let dirty = false
  let backoffMs = FIRST_BACKOFF_MS

  /** 成功したら true。失敗しても dirty は落とさない（次の alarm で再挑戦する）。 */
  const write = async (): Promise<boolean> => {
    try {
      await deps.persist()
      dirty = false
      backoffMs = FIRST_BACKOFF_MS
      return true
    } catch {
      return false
    }
  }

  return {
    markDirty: async () => {
      dirty = true
      if ((await deps.storage.getAlarm()) !== null) return
      await deps.storage.setAlarm(deps.now() + PERSIST_DELAY_MS)
    },

    onAlarm: async () => {
      if (!dirty) return
      if (await write()) return
      await deps.storage.setAlarm(deps.now() + backoffMs)
      backoffMs = Math.min(backoffMs * 2, PERSIST_BACKOFF_MAX_MS)
    },

    flush: async () => {
      if (!dirty) return
      await write()
    },
  }
}
