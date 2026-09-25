/**
 * flags/<tool>.json（正本）を D1 の `feature_flags` に反映する SQL を作る（ADR-0004）。
 * 生成した SQL は `wrangler d1 execute --file` で流す。
 */
import type { FlagDefinition, Result } from '../../packages/flags/src/core/types.ts'

/** migration と同じ定義。IF NOT EXISTS なので migration より先に同期が走っても壊れない */
export const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS feature_flags (
  key        TEXT    PRIMARY KEY NOT NULL,
  definition TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);`

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`

export type SyncInput = {
  flags: FlagDefinition[]
  /** 明示的に消す flag。ここに無いものは JSON から消えても D1 に残る */
  remove: string[]
  /** Unix 秒 */
  now: number
}

export const buildSyncSql = ({ flags, remove, now }: SyncInput): string => {
  const statements = [CREATE_TABLE_SQL]
  for (const flag of flags) {
    statements.push(
      [
        'INSERT INTO feature_flags (key, definition, updated_at)',
        `VALUES (${sqlString(flag.key)}, ${sqlString(JSON.stringify(flag))}, ${now})`,
        'ON CONFLICT (key) DO UPDATE SET',
        '  definition = excluded.definition, updated_at = excluded.updated_at',
        // 変わっていない flag の updated_at は動かさない（監査で「いつ変えたか」を正しく残す）
        '  WHERE feature_flags.definition <> excluded.definition;',
      ].join('\n'),
    )
  }
  if (remove.length > 0) {
    statements.push(`DELETE FROM feature_flags WHERE key IN (${remove.map(sqlString).join(', ')});`)
  }
  return `${statements.join('\n\n')}\n`
}

/** kill switch: 1 つの flag を即座に無効化する（あとで正本 JSON にも反映すること） */
export const buildKillSwitchSql = (flagKey: string, now: number): Result<string, string> => {
  if (!KEY.test(flagKey)) return { ok: false, error: `invalid flag key: ${flagKey}` }
  if (!Number.isInteger(now)) return { ok: false, error: `invalid timestamp: ${now}` }
  return {
    ok: true,
    value: `UPDATE feature_flags SET definition = json_set(definition, '$.enabled', json('false')), updated_at = ${now} WHERE key = ${sqlString(flagKey)};`,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type WranglerConfig = {
  name: string
  compatibility_date: string
  d1_databases: { binding: 'DB'; database_name: string; database_id: string }[]
}

/**
 * 同期専用の最小 wrangler 設定。プロダクトの wrangler.jsonc は本番 D1 を指しているので使わず、
 * production の D1 を明示して `wrangler d1 execute DB --remote` する。
 */
export const buildWranglerConfig = (input: {
  tool: string
  databaseName: string
  databaseId: string
}): Result<WranglerConfig, string> => {
  if (!KEY.test(input.tool)) return { ok: false, error: `invalid tool: ${input.tool}` }
  if (!/^[a-z][a-z0-9-]*$/.test(input.databaseName)) {
    return { ok: false, error: `invalid database name: ${input.databaseName}` }
  }
  if (!UUID.test(input.databaseId)) {
    return { ok: false, error: `D1 id for ${input.databaseName} is missing or not a UUID` }
  }
  return {
    ok: true,
    value: {
      name: `rimltools-flags-sync-${input.tool}`,
      compatibility_date: '2026-09-01',
      d1_databases: [
        { binding: 'DB', database_name: input.databaseName, database_id: input.databaseId },
      ],
    },
  }
}
