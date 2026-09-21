import { parseFlagDefinition } from './core/parse.ts'
import type { FlagDefinition, Result } from './core/types.ts'

/** D1Database のうち、ここで使う部分だけ（テストでフェイクに差し替える） */
export type D1Like = {
  prepare: (sql: string) => { all: () => Promise<{ results: unknown[] }> }
}

/** Cache API（`caches.default`）のうち、ここで使う部分だけ */
export type CacheLike = {
  match: (request: Request | string) => Promise<Response | undefined>
  put: (request: Request | string, response: Response) => Promise<void>
}

export type FlagLog = (entry: Record<string, unknown>) => void

export type FlagStore = { load: () => Promise<Result<Map<string, FlagDefinition>, string>> }

export type D1FlagStoreOptions = {
  db: D1Like
  /** 省略すると毎回 D1 を読む（ローカル開発・テスト用） */
  cache?: CacheLike
  tool: string
  /** Cache API に置く秒数。flag を変えてから効くまでの最大遅延になる */
  ttlSeconds: number
  log: FlagLog
}

type Row = { key: string; definition: string }

const SQL = 'SELECT key, definition FROM feature_flags'

const isRow = (value: unknown): value is Row =>
  typeof value === 'object'
  && value !== null
  && 'key' in value
  && typeof value.key === 'string'
  && 'definition' in value
  && typeof value.definition === 'string'

const parseJson = (text: string): Result<unknown, string> => {
  try {
    const value: unknown = JSON.parse(text)
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const toMap = (rows: unknown[], log: FlagLog, tool: string): Map<string, FlagDefinition> => {
  const flags = new Map<string, FlagDefinition>()
  for (const row of rows) {
    if (!isRow(row)) continue
    const json = parseJson(row.definition)
    const parsed = json.ok
      ? parseFlagDefinition(json.value)
      : { ok: false as const, error: [json.error] }
    if (parsed.ok) flags.set(parsed.value.key, parsed.value)
    // 1 つ壊れていても他の flag は使えるようにする。壊れた flag は呼び出し側の既定値になる。
    else log({ event: 'flag_invalid', tool, flag: row.key, errors: parsed.error })
  }
  return flags
}

/**
 * D1 の `feature_flags` 表から全 flag を読み、Cache API に `ttlSeconds` 秒置く。
 * 1 リクエストで何度評価しても D1 を読むのは TTL ごとに 1 回（rows read を抑える）。
 */
export const createD1FlagStore = (options: D1FlagStoreOptions): FlagStore => {
  const { db, cache, tool, ttlSeconds, log } = options
  // Cache API のキーは URL。外に出ないホスト名にする。
  const cacheKey = `https://flags.rimltools.internal/${encodeURIComponent(tool)}/v1`

  const readD1 = async (): Promise<Result<Row[], string>> => {
    try {
      const { results } = await db.prepare(SQL).all()
      return { ok: true, value: results.filter(isRow) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    load: async () => {
      const hit = await cache?.match(cacheKey)
      if (hit !== undefined) {
        const cached = parseJson(await hit.text())
        if (cached.ok && Array.isArray(cached.value)) {
          return { ok: true, value: toMap(cached.value, log, tool) }
        }
      }

      const rows = await readD1()
      if (!rows.ok) return rows
      if (cache !== undefined) {
        const body = new Response(JSON.stringify(rows.value), {
          headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSeconds}` },
        })
        await cache.put(cacheKey, body)
      }
      return { ok: true, value: toMap(rows.value, log, tool) }
    },
  }
}
