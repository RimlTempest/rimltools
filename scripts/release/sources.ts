import type { Result } from '../lib/tools.ts'
import type { Stats } from './analysis.ts'

/**
 * canary 判定に使う「版ごとの requests / errors」の取り方（ADR-0003）。
 *
 * 判定（analysis.ts の judgeCanary）は共通で、数字の出どころだけを差し替える。優先順:
 *   1. GraphQL Analytics — workersInvocationsAdaptive に版の次元があるときだけ（実行時に introspection で確認）
 *   2. Workers Observability（Workers Logs）— invocation log を版と outcome で group by
 *   3. どちらも無い — 判定しない。リリースは割合を保って止まり、人が決める（ロールバックはしない）
 */
export type StatsSource = {
  name: string
  /** この環境で版ごとの集計が取れるか */
  probe: () => Promise<boolean>
  stats: (worker: string, since: Date, until: Date) => Promise<Result<Map<string, Stats>, string>>
}

export const selectSource = async (sources: StatsSource[]): Promise<StatsSource | undefined> => {
  for (const source of sources) {
    // 優先順を守るため順番に確かめる
    // eslint-disable-next-line no-await-in-loop
    if (await source.probe()) return source
  }
  return undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const at = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined)

const apiErrors = (body: unknown): string | undefined => {
  if (at(body, 'success') === true) return undefined
  const errors = at(body, 'errors')
  const messages = Array.isArray(errors)
    ? errors.map((e) => {
        const m = at(e, 'message')
        return typeof m === 'string' ? m : 'unknown error'
      })
    : []
  return messages.join('; ') || 'request failed'
}

// ── 1. GraphQL Analytics ─────────────────────────────────────────────

/** dimensions の型名は公開ドキュメントに無いので、候補を別名で同時に引く */
const dimensionTypes = [
  'AccountWorkersInvocationsAdaptiveDimensions',
  'AccountWorkersInvocationsAdaptiveGroupsDimensions',
]

export const introspectionQuery = `query VersionDimension {
${dimensionTypes.map((t, i) => `  t${i}: __type(name: "${t}") { name fields { name } }`).join('\n')}
}`

const versionFieldPattern = /^scriptVersion(Id)?$/

/** introspection の結果から、版を表す次元のフィールド名を探す */
export const graphqlVersionField = (body: unknown): string | undefined => {
  const data = at(body, 'data')
  if (!isRecord(data)) return undefined
  for (const type of Object.values(data)) {
    const fields = at(type, 'fields')
    if (!Array.isArray(fields)) continue
    for (const field of fields) {
      const name = at(field, 'name')
      if (typeof name === 'string' && versionFieldPattern.test(name)) return name
    }
  }
  return undefined
}

/** 版の次元名を埋め込んだ集計クエリ（名前は introspection で確かめたものだけを使う） */
export const graphqlStatsQuery = (versionField: string): string =>
  `query CanaryStats($accountTag: string!, $scriptName: string!, $since: Time!, $until: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 1000
        filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }
      ) {
        sum { requests errors }
        dimensions { scriptVersion: ${versionField} }
      }
    }
  }
}`

// ── 2. Workers Observability（Workers Logs）────────────────────────────

/** 版 ID を持つキーの候補（keys エンドポイントで実在を確かめてから使う） */
export const versionKeyCandidates = [
  '$workers.scriptVersion.id',
  '$workers.scriptVersionId',
  '$metadata.scriptVersion',
]

/** invocation の outcome（ok / exception / exceededCpu …）を持つキーの候補 */
export const outcomeKeyCandidates = ['$workers.outcome', '$metadata.outcome']

/** 失敗に数えない outcome。canceled はクライアントの切断（Tail Worker の outcome 定義） */
const notFailures = new Set(['ok', 'canceled', 'unknown'])

export const pickKey = (candidates: string[], available: string[]): string | undefined =>
  candidates.find((c) => available.includes(c))

export const parseObservabilityKeys = (body: unknown): Result<string[], string> => {
  const error = apiErrors(body)
  if (error !== undefined) return { ok: false, error: `observability keys: ${error}` }
  const result = at(body, 'result')
  if (!Array.isArray(result)) return { ok: false, error: 'observability keys: unexpected shape' }
  const keys = result.flatMap((k) => {
    const key = at(k, 'key')
    return typeof key === 'string' ? [key] : []
  })
  return { ok: true, value: keys }
}

type Filter = { key: string; operation: string; type: 'string'; value: string }

export const observabilityQuery = (opts: {
  worker: string
  versionKey: string
  outcomeKey: string
  since: Date
  until: Date
}) => {
  const filters: Filter[] = [
    { key: '$metadata.service', operation: 'eq', type: 'string', value: opts.worker },
    // invocation log（1 リクエスト 1 行）だけを数える。console.log の行は除く
    { key: '$metadata.type', operation: 'eq', type: 'string', value: 'cf-worker-event' },
  ]
  return {
    queryId: `rimltools-canary-${opts.worker}`,
    view: 'calculations',
    timeframe: { from: opts.since.getTime(), to: opts.until.getTime() },
    parameters: {
      datasets: ['cloudflare-workers'],
      filters,
      calculations: [{ operator: 'count', alias: 'invocations' }],
      groupBys: [
        { type: 'string', value: opts.versionKey },
        { type: 'string', value: opts.outcomeKey },
      ],
      limit: 2000,
    },
  }
}

export const parseObservabilityStats = (
  body: unknown,
  keys: { versionKey: string; outcomeKey: string },
): Result<Map<string, Stats>, string> => {
  const error = apiErrors(body)
  if (error !== undefined) return { ok: false, error: `observability query: ${error}` }
  const calculations = at(at(body, 'result'), 'calculations')
  if (!Array.isArray(calculations)) {
    return { ok: false, error: 'observability query: unexpected shape' }
  }
  const out = new Map<string, Stats>()
  for (const calculation of calculations) {
    const aggregates = at(calculation, 'aggregates')
    if (!Array.isArray(aggregates)) continue
    for (const aggregate of aggregates) {
      const count = at(aggregate, 'count') ?? at(aggregate, 'value')
      const groups = at(aggregate, 'groups')
      if (typeof count !== 'number' || !Array.isArray(groups)) continue
      const value = (key: string) => {
        const hit = groups.find((g) => at(g, 'key') === key)
        const v = at(hit, 'value')
        return typeof v === 'string' ? v : undefined
      }
      const version = value(keys.versionKey)
      if (version === undefined) continue
      const outcome = value(keys.outcomeKey) ?? 'unknown'
      const prev = out.get(version) ?? { requests: 0, errors: 0 }
      out.set(version, {
        requests: prev.requests + count,
        errors: prev.errors + (notFailures.has(outcome) ? 0 : count),
      })
    }
  }
  return { ok: true, value: out }
}
