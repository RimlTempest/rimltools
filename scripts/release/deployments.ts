import type { Result } from '../lib/tools.ts'

export type Deployment = {
  id: string
  createdOn: string
  versions: { versionId: string; percentage: number }[]
}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** REST `GET /accounts/:a/workers/scripts/:s/deployments` の応答を新しい順に並べる */
export const parseDeployments = (body: unknown): Result<Deployment[], string> => {
  if (!isRecord(body) || body['success'] !== true) {
    return { ok: false, error: `deployments API failed: ${JSON.stringify(body)}` }
  }
  const result = body['result']
  const raw = isRecord(result) ? result['deployments'] : undefined
  if (!Array.isArray(raw)) return { ok: false, error: 'deployments API: unexpected shape' }
  const deployments: Deployment[] = raw.filter(isRecord).map((d) => ({
    id: asString(d['id']),
    createdOn: asString(d['created_on']),
    versions: (Array.isArray(d['versions']) ? d['versions'] : []).filter(isRecord).map((v) => ({
      versionId: asString(v['version_id']),
      percentage: typeof v['percentage'] === 'number' ? v['percentage'] : 0,
    })),
  }))
  const newestFirst = deployments.toSorted((a, b) =>
    a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : 0,
  )
  return { ok: true, value: newestFirst }
}

/**
 * 切り戻し先 = 候補以外で、いま最も多く配信している版。
 * 最新のデプロイに候補しか無ければ、候補以外が 100% だった直近のデプロイを探す。
 */
export const currentStable = (deployments: Deployment[], candidate: string): string | undefined => {
  const [latest] = deployments
  if (latest === undefined) return undefined
  const others = latest.versions
    .filter((v) => v.versionId !== candidate)
    .toSorted((a, b) => b.percentage - a.percentage)
  if (others[0] !== undefined) return others[0].versionId
  for (const d of deployments) {
    const full = d.versions.find((v) => v.percentage === 100 && v.versionId !== candidate)
    if (full !== undefined) return full.versionId
  }
  return undefined
}

/** `wrangler versions deploy` に渡す version spec */
export const versionSpecs = (
  candidate: string,
  stable: string | undefined,
  percentage: number,
): string[] => {
  if (stable === undefined || percentage >= 100) return [`${candidate}@100%`]
  return [`${candidate}@${percentage}%`, `${stable}@${100 - percentage}%`]
}

/** WRANGLER_OUTPUT_FILE_PATH に出る ND-JSON から、指定 type の最後の行を取り出す */
export const parseWranglerOutput = (
  ndjson: string,
  type: string,
): Result<Record<string, unknown>, string> => {
  let found: Record<string, unknown> | undefined
  for (const line of ndjson.split('\n')) {
    if (line.trim() === '') continue
    let entry: unknown
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(entry)) continue
    if (entry['type'] === 'command-failed') {
      return { ok: false, error: `wrangler failed: ${asString(entry['message'], 'unknown')}` }
    }
    if (entry['type'] === type) found = entry
  }
  return found === undefined
    ? { ok: false, error: `no ${type} entry in wrangler output` }
    : { ok: true, value: found }
}
