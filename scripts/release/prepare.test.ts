import { describe, expect, test } from 'bun:test'

import { migrationConfigFor, preparedPath } from './prepare.ts'
import { noter, qrcc } from './fixtures.ts'

describe('preparedPath', () => {
  test('writes next to the build output so relative paths keep working', () => {
    expect(preparedPath('apps/qrcc', 'services/web/dist/server/wrangler.json', 'production')).toBe(
      'apps/qrcc/services/web/dist/server/wrangler.production.json',
    )
    // portal は wrangler.jsonc をそのまま使う（assets の相対パスが同じ場所から解決される）
    expect(preparedPath('apps/portal', 'wrangler.jsonc', 'production')).toBe(
      'apps/portal/wrangler.production.json',
    )
  })
})

describe('migrationConfigFor', () => {
  test('picks the build config whose migrations_dir is the one next to migrationsConfig', () => {
    const configs = [
      {
        worker: 'qrcc-api',
        path: 'apps/qrcc/services/web/dist/qrcc_api/wrangler.production.json',
        json: {
          d1_databases: [{ database_name: 'qrcc', migrations_dir: '../../../api/migrations' }],
        },
      },
      {
        worker: 'qrcc-web',
        path: 'apps/qrcc/services/web/dist/server/wrangler.production.json',
        json: {
          d1_databases: [{ database_name: 'qrcc', migrations_dir: '../../../api/migrations' }],
        },
      },
    ]
    const [spec] = qrcc.d1
    if (spec === undefined) return
    const result = migrationConfigFor(qrcc, spec, configs)
    expect(result).toEqual({
      ok: true,
      value: 'apps/qrcc/services/web/dist/qrcc_api/wrangler.production.json',
    })
  })

  test('noter migrates from the web worker (services/web/migrations)', () => {
    const configs = [
      {
        worker: 'noter-sync',
        path: 'apps/noter/services/web/dist/noter_sync/wrangler.production.json',
        json: {
          d1_databases: [{ database_name: 'noter', migrations_dir: '../../../sync/migrations' }],
        },
      },
      {
        worker: 'noter-web',
        path: 'apps/noter/services/web/dist/server/wrangler.production.json',
        json: { d1_databases: [{ database_name: 'noter', migrations_dir: '../../migrations' }] },
      },
    ]
    const [spec] = noter.d1
    if (spec === undefined) return
    const result = migrationConfigFor(noter, spec, configs)
    expect(result).toEqual({
      ok: true,
      value: 'apps/noter/services/web/dist/server/wrangler.production.json',
    })
  })

  test('fails when no build config carries the migrations', () => {
    const [spec] = qrcc.d1
    if (spec === undefined) return
    expect(migrationConfigFor(qrcc, spec, []).ok).toBe(false)
  })
})
