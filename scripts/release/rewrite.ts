import type { Result, Tool } from '../lib/tools.ts'
import type { DeployEnv } from './environment.ts'

/**
 * ビルドが生成した wrangler.json を、出す先の環境に合わせて書き換える（純関数）。
 *
 * - Worker 名・同じツール内の service / DO の参照に suffix を付ける
 * - D1 を環境の DB に差し替える
 * - routes を消す（Custom Domain は Terraform の持ち物。ADR-0005）
 * - APP_ORIGIN を環境のホストにし、本番では旧ホストを APP_LEGACY_ORIGINS に入れる
 * - preview URL は staging / preview の public Worker だけ開く（internal は ADR-0002 で非公開）
 */
export type RewriteContext = {
  tool: Tool
  env: Pick<DeployEnv, 'name' | 'suffix' | 'd1Id'>
  /** この環境で public Worker が受けるホスト名 */
  host: string
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const records = (value: unknown): Json[] =>
  Array.isArray(value) ? value.filter((item): item is Json => isRecord(item)) : []

/**
 * wrangler.jsonc（コメントと末尾カンマを含む）を読む。文字列の中の `//` は残す。
 * ビルド出力の wrangler.json はそのまま JSON なので、どちらもこれで読める。
 */
export const parseJsonc = (text: string): Result<unknown, string> => {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i] ?? ''
    const next = text[i + 1] ?? ''
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i += 1
    } else if (ch === '"') {
      inString = true
      out += ch
      i += 1
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else {
      out += ch
      i += 1
    }
  }
  try {
    return { ok: true, value: JSON.parse(out.replaceAll(/,(\s*[}\]])/g, '$1')) }
  } catch (error) {
    return { ok: false, error: `invalid JSON(C): ${String(error)}` }
  }
}

/** 元のオブジェクトを変えずに一部のフィールドだけ差し替えた複製を返す */
const withFields = (base: Json, fields: Json): Json => ({ ...base, ...fields })

export const rewriteConfig = (config: unknown, ctx: RewriteContext): Result<Json, string> => {
  if (!isRecord(config)) return { ok: false, error: 'wrangler.json is not an object' }
  const { tool, env, host } = ctx
  const ownWorkers = new Set(tool.workers.map((w) => w.name))
  const withSuffix = (name: string) => (ownWorkers.has(name) ? `${name}${env.suffix}` : name)

  const name = config['name']
  if (typeof name !== 'string' || !ownWorkers.has(name)) {
    return {
      ok: false,
      error: `wrangler.json names "${String(name)}", which ${tool.name} does not own`,
    }
  }
  const worker = tool.workers.find((w) => w.name === name)
  const isPublic = worker?.role === 'public'

  const errors: string[] = []
  // canary の判定は Workers Logs の invocation log を数えることがある（sources.ts）。
  // 既定では有効なので、明示的に切っている設定だけを止める
  const observability = config['observability']
  if (isRecord(observability)) {
    const logs = observability['logs']
    if (
      observability['enabled'] === false
      || (isRecord(logs) && logs['invocation_logs'] === false)
    ) {
      errors.push(`${name}: observability / invocation_logs must stay enabled (docs/release.md)`)
    }
  }
  const d1 = records(config['d1_databases']).map((db) => {
    const dbName = db['database_name']
    const spec = tool.d1.find((d) => d.name === dbName)
    if (spec === undefined) return db
    const id = env.d1Id(tool.name)
    if (id === undefined) errors.push(`no D1 id for ${tool.name} in ${env.name}`)
    return withFields(db, {
      database_name: `${spec.name}${env.suffix}`,
      database_id: id ?? '',
    })
  })

  const services = records(config['services']).map((s) =>
    typeof s['service'] === 'string' ? withFields(s, { service: withSuffix(s['service']) }) : s,
  )

  const durable = isRecord(config['durable_objects']) ? config['durable_objects'] : undefined
  const durableObjects =
    durable === undefined
      ? undefined
      : {
          ...durable,
          bindings: records(durable['bindings']).map((b) =>
            typeof b['script_name'] === 'string'
              ? withFields(b, { script_name: withSuffix(b['script_name']) })
              : b,
          ),
        }

  const vars = isRecord(config['vars']) ? { ...config['vars'] } : undefined
  if (vars !== undefined && 'APP_ORIGIN' in vars) {
    vars['APP_ORIGIN'] = `https://${host}`
    // ドメイン移行中は旧ホストでも動かす（Terraform の legacy_hosts_mode）。本番だけ
    vars['APP_LEGACY_ORIGINS'] =
      env.name === 'production' ? tool.legacyHosts.map((h) => `https://${h}`).join(',') : ''
  }

  if (errors.length > 0) return { ok: false, error: errors.join('\n') }

  const { routes: _routes, route: _route, ...rest } = config
  const out: Json = {
    ...rest,
    name: `${name}${env.suffix}`,
    workers_dev: false,
    // staging / preview の public Worker だけ開く。設定で明示的に閉じているもの（portal）は閉じたまま
    preview_urls: isPublic && env.name !== 'production' && config['preview_urls'] !== false,
  }
  if ('d1_databases' in config) out['d1_databases'] = d1
  if ('services' in config) out['services'] = services
  if (durableObjects !== undefined) out['durable_objects'] = durableObjects
  if (vars !== undefined) out['vars'] = vars
  return { ok: true, value: out }
}
