import { dirname, join, normalize } from 'node:path'

import type { D1Spec, Result, Tool } from '../lib/tools.ts'
import type { EnvName } from './environment.ts'

export type PreparedConfig = { worker: string; path: string; json: Record<string, unknown> }

/** 環境向けに書き換えた wrangler.json の置き場所（ビルド出力と同じディレクトリ） */
export const preparedPath = (toolPath: string, buildConfig: string, env: EnvName): string =>
  join(toolPath, dirname(buildConfig), `wrangler.${env}.json`)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * D1 の migration を適用するときに使う設定を選ぶ。
 * tools.json の migrationsConfig（元の wrangler.jsonc）の隣の `migrations/` を
 * migrations_dir として指しているビルド出力を探す。
 */
export const migrationConfigFor = (
  tool: Tool,
  d1: D1Spec,
  configs: PreparedConfig[],
): Result<string, string> => {
  const wanted = normalize(join(tool.path, dirname(d1.migrationsConfig), 'migrations'))
  for (const config of configs) {
    const dbs = config.json['d1_databases']
    if (!Array.isArray(dbs)) continue
    for (const db of dbs) {
      if (!isRecord(db) || typeof db['migrations_dir'] !== 'string') continue
      if (normalize(join(dirname(config.path), db['migrations_dir'])) === wanted) {
        return { ok: true, value: config.path }
      }
    }
  }
  return { ok: false, error: `${tool.name}: no build config applies migrations from ${wanted}` }
}
