/**
 * DO SQLite のスキーマと読み書き（ADR-0005 / `docs/realtime-protocol.md` §4）。
 *
 * 文書の状態は **1 文書 1 行**。更新ログ（Yjs の update を追記する方式）は採らない。
 * 行書き込みが Workers Free で最初に枯れる資源なので、行数を更新数に比例させない。
 */
import { toArrayBuffer } from './bytes.ts'
import type { RoomStorage, SqlValue } from './ports.ts'

export const SCHEMA_VERSION = 1

const SCHEMA_VERSION_KEY = 'schema_version'

/** 段階適用できるよう、版ごとに文の配列を持つ。既存の版の中身は書き換えない。 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS meta (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS document_state (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       state BLOB NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
  ],
]

const readVersion = (storage: RoomStorage): number => {
  const rows = storage.sql
    .exec('SELECT value FROM meta WHERE key = ?1', SCHEMA_VERSION_KEY)
    .toArray()
  const raw = rows[0]?.['value']
  if (typeof raw !== 'string') return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * wake のたびに呼ぶ。`meta` テーブル自体が無い最初の 1 回だけは
 * 版の読み取りが空になるので、v1 の CREATE から順に当てる。
 */
export const migrate = (storage: RoomStorage): void => {
  storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  const current = readVersion(storage)
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    for (const statement of MIGRATIONS[version] ?? []) storage.sql.exec(statement)
  }
  if (current < SCHEMA_VERSION) {
    storage.sql.exec(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)',
      SCHEMA_VERSION_KEY,
      String(SCHEMA_VERSION),
    )
  }
}

const toBytes = (value: SqlValue | undefined): Uint8Array | null =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : null

export const loadState = (storage: RoomStorage): Uint8Array | null => {
  const rows = storage.sql.exec('SELECT state FROM document_state WHERE id = 1').toArray()
  return toBytes(rows[0]?.['state'])
}

export const saveState = (storage: RoomStorage, state: Uint8Array, updatedAt: number): void => {
  storage.sql.exec(
    'INSERT OR REPLACE INTO document_state (id, state, updated_at) VALUES (1, ?1, ?2)',
    toArrayBuffer(state),
    updatedAt,
  )
}
