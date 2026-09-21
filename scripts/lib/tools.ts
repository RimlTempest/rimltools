/**
 * tools.json（RimlTools の台帳）を読み、検証済みの型にする。
 * CI・リリース・監視のスクリプトはこれを経由して台帳を読む（ADR-0001）。
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export type WorkerRole = 'public' | 'internal'

export type WorkerSpec = {
  name: string
  role: WorkerRole
  buildConfig: string
  durableObjects: boolean
}

export type D1Spec = { name: string; binding: string; migrationsConfig: string }

export type ReleaseMode = 'canary' | 'big-bang'

export type ReleaseSpec = { mode: ReleaseMode; steps: number[]; bakeMinutes: number }

export type Tool = {
  name: string
  title: string
  description: string
  path: string
  subdomain: string
  /** 本番のホスト名（`<subdomain>.<domain>`） */
  host: string
  /** staging のホスト名（`<subdomain>-staging.<domain>`） */
  stagingHost: string
  legacyHosts: string[]
  rust: boolean
  workers: WorkerSpec[]
  d1: D1Spec[]
  release: ReleaseSpec
  slo: { availability: number; windowDays: number }
  smoke: { cli: string; browser: string; e2ePackage: string }
}

export type Registry = { domain: string; zone: string; tools: Tool[] }

type Reader = { path: string; errors: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (r: Reader, obj: Record<string, unknown>, key: string): string => {
  const value = obj[key]
  if (typeof value === 'string' && value.length > 0) return value
  r.errors.push(`${r.path}.${key}: expected a non-empty string`)
  return ''
}

const num = (r: Reader, obj: Record<string, unknown>, key: string): number => {
  const value = obj[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  r.errors.push(`${r.path}.${key}: expected a number`)
  return 0
}

const bool = (r: Reader, obj: Record<string, unknown>, key: string): boolean => {
  const value = obj[key]
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  r.errors.push(`${r.path}.${key}: expected a boolean`)
  return false
}

const list = (r: Reader, obj: Record<string, unknown>, key: string): unknown[] => {
  const value = obj[key]
  if (Array.isArray(value)) return value
  r.errors.push(`${r.path}.${key}: expected an array`)
  return []
}

const records = (
  r: Reader,
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  list(r, obj, key).forEach((item, i) => {
    if (isRecord(item)) out.push(item)
    else r.errors.push(`${r.path}.${key}[${i}]: expected an object`)
  })
  return out
}

const child = (r: Reader, obj: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = obj[key]
  if (isRecord(value)) return value
  r.errors.push(`${r.path}.${key}: expected an object`)
  return {}
}

const parseRole = (r: Reader, value: string): WorkerRole => {
  if (value === 'public' || value === 'internal') return value
  r.errors.push(`${r.path}.role: expected "public" or "internal"`)
  return 'internal'
}

const parseMode = (r: Reader, value: string): ReleaseMode => {
  if (value === 'canary' || value === 'big-bang') return value
  r.errors.push(`${r.path}.release.mode: expected "canary" or "big-bang"`)
  return 'big-bang'
}

const parseTool = (
  errors: string[],
  domain: string,
  raw: Record<string, unknown>,
  index: number,
): Tool => {
  const r: Reader = { path: `tools[${index}]`, errors }
  const name = str(r, raw, 'name')
  const subdomain = str(r, raw, 'subdomain')

  const workers = records(r, raw, 'workers').map((w) => ({
    name: str(r, w, 'name'),
    role: parseRole(r, str(r, w, 'role')),
    buildConfig: str(r, w, 'buildConfig'),
    durableObjects: bool(r, w, 'durableObjects'),
  }))
  if (workers.filter((w) => w.role === 'public').length !== 1) {
    errors.push(`${name}: exactly one public worker is required`)
  }

  const release = child(r, raw, 'release')
  const steps = list(r, release, 'steps').filter((s): s is number => typeof s === 'number')
  const ascending = steps.every((s, i) => s > 0 && s <= 100 && (i === 0 || s > (steps[i - 1] ?? 0)))
  if (!ascending || steps.at(-1) !== 100) {
    errors.push(`${name}: release.steps must be ascending percentages ending at 100`)
  }

  const slo = child(r, raw, 'slo')
  const smoke = child(r, raw, 'smoke')

  return {
    name,
    title: str(r, raw, 'title'),
    description: str(r, raw, 'description'),
    path: str(r, raw, 'path'),
    subdomain,
    host: `${subdomain}.${domain}`,
    stagingHost: `${subdomain}-staging.${domain}`,
    legacyHosts: list(r, raw, 'legacyHosts').filter((h): h is string => typeof h === 'string'),
    rust: bool(r, raw, 'rust'),
    workers,
    d1: records(r, raw, 'd1').map((d) => ({
      name: str(r, d, 'name'),
      binding: str(r, d, 'binding'),
      migrationsConfig: str(r, d, 'migrationsConfig'),
    })),
    release: {
      mode: parseMode(r, str(r, release, 'mode')),
      steps,
      bakeMinutes: num(r, release, 'bakeMinutes'),
    },
    slo: { availability: num(r, slo, 'availability'), windowDays: num(r, slo, 'windowDays') },
    smoke: {
      cli: str(r, smoke, 'cli'),
      browser: str(r, smoke, 'browser'),
      e2ePackage: str(r, smoke, 'e2ePackage'),
    },
  }
}

export const parseTools = (raw: unknown): Result<Registry, string> => {
  if (!isRecord(raw)) return { ok: false, error: 'tools.json: expected an object' }
  const errors: string[] = []
  const root: Reader = { path: 'tools.json', errors }
  const domain = str(root, raw, 'domain')
  const zone = str(root, raw, 'zone')
  const tools = records(root, raw, 'tools').map((t, i) => parseTool(errors, domain, t, i))

  const seen = new Set<string>()
  for (const tool of tools) {
    if (seen.has(tool.name)) errors.push(`duplicate tool name: ${tool.name}`)
    seen.add(tool.name)
  }

  if (errors.length > 0) return { ok: false, error: errors.join('\n') }
  return { ok: true, value: { domain, zone, tools } }
}

/** リポジトリ直下の tools.json を読む（I/O はここだけ）。 */
export const loadTools = async (
  path = new URL('../../tools.json', import.meta.url),
): Promise<Result<Registry, string>> => {
  const file = Bun.file(path)
  if (!(await file.exists())) return { ok: false, error: `not found: ${path.toString()}` }
  const raw: unknown = await file.json()
  return parseTools(raw)
}

export const findTool = (registry: Registry, name: string): Result<Tool, string> => {
  const tool = registry.tools.find((t) => t.name === name)
  if (tool === undefined) {
    const known = registry.tools.map((t) => t.name).join(', ')
    return { ok: false, error: `unknown tool "${name}" (known: ${known})` }
  }
  return { ok: true, value: tool }
}
