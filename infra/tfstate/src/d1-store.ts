import { err, ok, type Result } from '@rimltools/contract'

import type { Lock } from './core/lock.ts'
import type { D1Like, D1Row, D1Stmt, LockAttempt, StateStore, VersionInfo } from './store.ts'

export type D1StoreOptions = {
  /** 1 行に入れる本文の最大バイト数。D1 の 1 値の上限（2 MB）より十分小さくする */
  chunkBytes?: number
  /** 残す版の数（復元用。docs/runbooks/tfstate-restore.md） */
  keepVersions?: number
}

/** UTF-8 のバイト数で区切る。コードポイントの途中では切らない */
export const splitByBytes = (text: string, maxBytes: number): string[] => {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let current = ''
  let size = 0
  for (const char of text) {
    const bytes = encoder.encode(char).length
    if (size + bytes > maxBytes && current !== '') {
      chunks.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  if (current !== '' || chunks.length === 0) chunks.push(current)
  return chunks
}

const num = (row: D1Row | null, key: string): number | null => {
  const value = row?.[key]
  return typeof value === 'number' ? value : null
}

const str = (row: D1Row | null, key: string): string | null => {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

// D1 は失敗を例外で返す。ストアの外へは Result で渡す
const attempt = async <T>(run: () => Promise<Result<T, string>>): Promise<Result<T, string>> => {
  try {
    return await run()
  } catch (error: unknown) {
    return err(error instanceof Error ? `d1: ${error.message}` : 'd1: unknown error')
  }
}

export const createD1Store = (db: D1Like, options: D1StoreOptions = {}): StateStore => {
  const chunkBytes = options.chunkBytes ?? 1_000_000
  const keep = options.keepVersions ?? 20

  const currentVersion = async (path: string): Promise<number | null> =>
    num(await db.prepare('SELECT version FROM states WHERE path = ?').bind(path).first(), 'version')

  return {
    getState: (path) =>
      attempt(async () => {
        const version = await currentVersion(path)
        if (version === null) return ok(null)
        const meta = await db
          .prepare('SELECT chunks FROM state_versions WHERE path = ? AND version = ?')
          .bind(path, version)
          .first()
        const { results } = await db
          .prepare('SELECT data FROM state_chunks WHERE path = ? AND version = ? ORDER BY idx')
          .bind(path, version)
          .all()
        const parts = results.map((row) => str(row, 'data'))
        const complete = parts.every((p): p is string => p !== null)
        // 版の行と分割数が合わなければ、壊れた state を返さずに失敗させる
        if (!complete || parts.length !== num(meta, 'chunks')) {
          return err(`state for ${path} is incomplete (version ${version})`)
        }
        return ok(parts.join(''))
      }),

    putState: (path, body, meta, now) =>
      attempt(async () => {
        const latest = num(
          await db
            .prepare('SELECT MAX(version) AS version FROM state_versions WHERE path = ?')
            .bind(path)
            .first(),
          'version',
        )
        const version = (latest ?? 0) + 1
        const chunks = splitByBytes(body, chunkBytes)
        const size = new TextEncoder().encode(body).length
        const cutoff = version - keep
        const statements: D1Stmt[] = [
          db
            .prepare(
              'INSERT INTO state_versions (path, version, serial, lineage, size, chunks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .bind(path, version, meta.serial, meta.lineage, size, chunks.length, now),
          ...chunks.map((data, idx) =>
            db
              .prepare('INSERT INTO state_chunks (path, version, idx, data) VALUES (?, ?, ?, ?)')
              .bind(path, version, idx, data),
          ),
          db
            .prepare(
              'INSERT INTO states (path, version, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at',
            )
            .bind(path, version, now),
          db.prepare('DELETE FROM state_chunks WHERE path = ? AND version <= ?').bind(path, cutoff),
          db
            .prepare('DELETE FROM state_versions WHERE path = ? AND version <= ?')
            .bind(path, cutoff),
        ]
        await db.batch(statements)
        return ok(undefined)
      }),

    listVersions: (path) =>
      attempt(async () => {
        const { results } = await db
          .prepare(
            'SELECT version, serial, lineage, size, created_at FROM state_versions WHERE path = ? ORDER BY version DESC',
          )
          .bind(path)
          .all()
        const versions: VersionInfo[] = []
        for (const row of results) {
          const version = num(row, 'version')
          const serial = num(row, 'serial')
          const lineage = str(row, 'lineage')
          const size = num(row, 'size')
          const createdAt = num(row, 'created_at')
          if (
            version === null
            || serial === null
            || lineage === null
            || size === null
            || createdAt === null
          ) {
            return err(`state_versions row for ${path} is malformed`)
          }
          versions.push({ version, serial, lineage, size, createdAt })
        }
        return ok(versions)
      }),

    getLock: (path, now) =>
      attempt(async () => {
        const row = await db
          .prepare('SELECT lock_id, info FROM locks WHERE path = ? AND expires_at > ?')
          .bind(path, now)
          .first()
        const id = str(row, 'lock_id')
        const info = str(row, 'info')
        return ok(id === null || info === null ? null : { id, info })
      }),

    acquireLock: (path, lock: Lock, expiresAt, now) =>
      attempt<LockAttempt>(async () => {
        // 空いている（行が無い / 期限切れ）ときだけ書ける。1 文で行うので競合しても二重取得にならない
        const { meta } = await db
          .prepare(
            'INSERT INTO locks (path, lock_id, info, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET lock_id = excluded.lock_id, info = excluded.info, expires_at = excluded.expires_at WHERE locks.expires_at <= ?',
          )
          .bind(path, lock.id, lock.info, expiresAt, now)
          .run()
        if (meta.changes > 0) return ok({ acquired: true })
        const row = await db
          .prepare('SELECT lock_id, info FROM locks WHERE path = ?')
          .bind(path)
          .first()
        const id = str(row, 'lock_id')
        const info = str(row, 'info')
        if (id === null || info === null) return err(`lock for ${path} could not be read`)
        return ok({ acquired: false, holder: { id, info } })
      }),

    releaseLock: (path, id) =>
      attempt(async () => {
        const { meta } = await db
          .prepare('DELETE FROM locks WHERE path = ? AND lock_id = ?')
          .bind(path, id)
          .run()
        return ok(meta.changes > 0)
      }),
  }
}
