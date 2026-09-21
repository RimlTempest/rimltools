import { describe, expect, test } from 'bun:test'

import type { FlagDefinition } from '../../packages/flags/src/core/types.ts'
import { buildKillSwitchSql, buildSyncSql, CREATE_TABLE_SQL, sqlString } from './sql.ts'

const flag: FlagDefinition = {
  key: 'new-editor',
  description: "Tom's new editor",
  type: 'boolean',
  enabled: true,
  variants: { on: true, off: false },
  defaultVariant: 'off',
  rules: [],
}

describe('sqlString', () => {
  test('quotes and escapes single quotes', () => {
    expect(sqlString("it's")).toBe("'it''s'")
  })
})

describe('buildSyncSql', () => {
  test('creates the table if needed and upserts every flag', () => {
    const sql = buildSyncSql({ flags: [flag], remove: [], now: 1_700_000_000 })
    expect(sql.startsWith(CREATE_TABLE_SQL)).toBe(true)
    expect(sql).toContain('INSERT INTO feature_flags (key, definition, updated_at)')
    expect(sql).toContain("'new-editor'")
    expect(sql).toContain("Tom''s new editor")
    expect(sql).toContain('ON CONFLICT (key) DO UPDATE SET')
    // 変わっていない flag の updated_at を動かさない
    expect(sql).toContain('WHERE feature_flags.definition <> excluded.definition')
    expect(sql).not.toContain('DELETE')
  })

  test('stores the canonical JSON of the parsed definition', () => {
    const sql = buildSyncSql({ flags: [flag], remove: [], now: 1 })
    expect(sql).toContain(sqlString(JSON.stringify(flag)))
  })

  test('deletes only flags listed explicitly in remove', () => {
    const sql = buildSyncSql({ flags: [], remove: ['old-flag', 'older'], now: 1 })
    expect(sql).toContain("DELETE FROM feature_flags WHERE key IN ('old-flag', 'older');")
  })
})

describe('buildKillSwitchSql', () => {
  test('disables a single flag', () => {
    const result = buildKillSwitchSql('new-editor', 42)
    expect(result).toEqual({
      ok: true,
      value:
        "UPDATE feature_flags SET definition = json_set(definition, '$.enabled', json('false')), updated_at = 42 WHERE key = 'new-editor';",
    })
  })

  test('rejects keys that are not kebab-case (no SQL injection through inputs)', () => {
    expect(buildKillSwitchSql("x'; DROP TABLE feature_flags; --", 1).ok).toBe(false)
  })
})

describe('buildWranglerConfig', () => {
  test('binds the target D1 so `wrangler d1 execute DB --remote` hits the right database', async () => {
    const { buildWranglerConfig } = await import('./sql.ts')
    const result = buildWranglerConfig({
      tool: 'qrcc',
      databaseName: 'qrcc-staging',
      databaseId: '00000000-0000-4000-8000-000000000000',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'rimltools-flags-sync-qrcc',
        compatibility_date: '2026-09-01',
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'qrcc-staging',
            database_id: '00000000-0000-4000-8000-000000000000',
          },
        ],
      },
    })
  })

  test('refuses a missing or malformed database id', async () => {
    const { buildWranglerConfig } = await import('./sql.ts')
    expect(buildWranglerConfig({ tool: 'qrcc', databaseName: 'qrcc', databaseId: '' }).ok).toBe(
      false,
    )
    expect(
      buildWranglerConfig({ tool: 'qrcc', databaseName: 'qrcc', databaseId: 'x; rm -rf /' }).ok,
    ).toBe(false)
  })
})

describe('generated SQL on SQLite (D1 is SQLite)', () => {
  test('sync is idempotent, keeps updated_at for unchanged flags, and kill switch disables', async () => {
    const { Database } = await import('bun:sqlite')
    const { parseFlagDefinition } = await import('../../packages/flags/src/core/parse.ts')
    const db = new Database(':memory:')
    const other = { ...flag, key: 'other' }

    db.exec(buildSyncSql({ flags: [flag, other], remove: [], now: 100 }))
    db.exec(buildSyncSql({ flags: [flag, { ...other, enabled: false }], remove: [], now: 200 }))

    const rows = db
      .query<{ key: string; definition: string; updated_at: number }, []>(
        'SELECT key, definition, updated_at FROM feature_flags ORDER BY key',
      )
      .all()
    expect(rows.map((r) => [r.key, r.updated_at])).toEqual([
      ['new-editor', 100],
      ['other', 200],
    ])

    const kill = buildKillSwitchSql('new-editor', 300)
    if (!kill.ok) throw new Error(kill.error)
    db.exec(kill.value)
    const killed = db
      .query<{ definition: string }, []>(
        "SELECT definition FROM feature_flags WHERE key = 'new-editor'",
      )
      .get()
    const parsed = parseFlagDefinition(JSON.parse(killed?.definition ?? '{}'))
    expect(parsed.ok && parsed.value.enabled).toBe(false)

    db.exec(buildSyncSql({ flags: [], remove: ['other'], now: 400 }))
    const left = db.query<{ n: number }, []>('SELECT count(*) AS n FROM feature_flags').get()
    expect(left?.n).toBe(1)
  })
})
