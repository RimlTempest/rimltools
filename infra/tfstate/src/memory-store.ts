import { ok } from '@rimltools/contract'

import type { Lock } from './core/lock.ts'
import type { StateStore, VersionInfo } from './store.ts'

type Entry = { body: string; info: VersionInfo }

/** テストとローカル確認用のストア。振る舞いは D1 版と同じ（store.contract.test.ts） */
export const createMemoryStore = (options: { keepVersions?: number } = {}): StateStore => {
  const keep = options.keepVersions ?? 20
  const states = new Map<string, Entry[]>()
  const locks = new Map<string, { lock: Lock; expiresAt: number }>()

  return {
    getState: async (path) => ok(states.get(path)?.at(-1)?.body ?? null),
    putState: async (path, body, meta, now) => {
      const entries = states.get(path) ?? []
      const version = (entries.at(-1)?.info.version ?? 0) + 1
      const info = {
        version,
        serial: meta.serial,
        lineage: meta.lineage,
        size: body.length,
        createdAt: now,
      }
      states.set(path, [...entries, { body, info }].slice(-keep))
      return ok(undefined)
    },
    deleteState: async (path) => {
      states.delete(path)
      return ok(undefined)
    },
    listVersions: async (path) => ok((states.get(path) ?? []).map((e) => e.info).toReversed()),
    getLock: async (path, now) => {
      const held = locks.get(path)
      return ok(held !== undefined && held.expiresAt > now ? held.lock : null)
    },
    acquireLock: async (path, lock, expiresAt, now) => {
      const held = locks.get(path)
      if (held !== undefined && held.expiresAt > now)
        return ok({ acquired: false, holder: held.lock })
      locks.set(path, { lock, expiresAt })
      return ok({ acquired: true })
    },
    releaseLock: async (path, id) => {
      const held = locks.get(path)
      if (held === undefined || held.lock.id !== id) return ok(false)
      locks.delete(path)
      return ok(true)
    },
  }
}
