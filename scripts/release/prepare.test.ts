import { describe, expect, test } from 'bun:test'

import { migrationConfigFor, preparedPath } from './prepare.ts'
import { noter, qrcc } from './fixtures.ts'

describe('preparedPath', () => {
  test('writes next to the build output so relative paths keep working', () => {
    expect(preparedPath('products/qrcc', 'apps/web/dist/server/wrangler.json', 'staging')).toBe(
      'products/qrcc/apps/web/dist/server/wrangler.staging.json',
    )
    // portal は wrangler.jsonc をそのまま使う（assets の相対パスが同じ場所から解決される）
    expect(preparedPath('products/portal', 'wrangler.jsonc', 'production')).toBe(
      'products/portal/wrangler.production.json',
    )
  })
})

describe('migrationConfigFor', () => {
  test('picks the build config whose migrations_dir is the one next to migrationsConfig', () => {
    const configs = [
      {
        worker: 'qrcc-api',
        path: 'products/qrcc/apps/web/dist/qrcc_api/wrangler.staging.json',
        json: {
          d1_databases: [
            { database_name: 'qrcc-staging', migrations_dir: '../../../api/migrations' },
          ],
        },
      },
      {
        worker: 'qrcc-web',
        path: 'products/qrcc/apps/web/dist/server/wrangler.staging.json',
        json: {
          d1_databases: [
            { database_name: 'qrcc-staging', migrations_dir: '../../../api/migrations' },
          ],
        },
      },
    ]
    const [spec] = qrcc.d1
    if (spec === undefined) return
    const result = migrationConfigFor(qrcc, spec, configs)
    expect(result).toEqual({
      ok: true,
      value: 'products/qrcc/apps/web/dist/qrcc_api/wrangler.staging.json',
    })
  })

  test('noter migrates from the web worker (apps/web/migrations)', () => {
    const configs = [
      {
        worker: 'noter-sync',
        path: 'products/noter/apps/web/dist/noter_sync/wrangler.production.json',
        json: {
          d1_databases: [{ database_name: 'noter', migrations_dir: '../../../sync/migrations' }],
        },
      },
      {
        worker: 'noter-web',
        path: 'products/noter/apps/web/dist/server/wrangler.production.json',
        json: { d1_databases: [{ database_name: 'noter', migrations_dir: '../../migrations' }] },
      },
    ]
    const [spec] = noter.d1
    if (spec === undefined) return
    const result = migrationConfigFor(noter, spec, configs)
    expect(result).toEqual({
      ok: true,
      value: 'products/noter/apps/web/dist/server/wrangler.production.json',
    })
  })

  test('fails when no build config carries the migrations', () => {
    const [spec] = qrcc.d1
    if (spec === undefined) return
    expect(migrationConfigFor(qrcc, spec, []).ok).toBe(false)
  })
})
