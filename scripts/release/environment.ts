import type { Result } from '../lib/tools.ts'

/**
 * GitHub environment（staging / production / preview）の契約。
 * 値は Terraform が environment の secrets / variables に書き込む（ADR-0005）。
 */
export type EnvName = 'staging' | 'production' | 'preview'

export type DeployEnv = {
  name: EnvName
  suffix: string
  baseDomain: string
  zoneId: string
  accountId: string
  /** ツールの D1 の id（`D1_<TOOL>_ID`）。環境ごとに別の DB を指す */
  d1Id: (tool: string) => string | undefined
}

const isEnvName = (value: string): value is EnvName =>
  value === 'staging' || value === 'production' || value === 'preview'

export const faroUrlVariable = (tool: string): string =>
  `FARO_URL_${tool.toUpperCase().replaceAll('-', '_')}`

export const d1IdVariable = (tool: string): string =>
  `D1_${tool.toUpperCase().replaceAll('-', '_')}_ID`

/**
 * リリーススクリプトが読んでよい設定の許可リスト。資格情報（API トークンや Access の
 * secret）は入れない。資格情報は使う箇所（fetch のヘッダ・wrangler の子プロセス）でだけ
 * process.env から直接読み、ログやエラー文字列に混ざる経路を作らない。
 */
export const releaseConfigKeys = [
  'RIMLTOOLS_ENV',
  'BASE_DOMAIN',
  'CF_ZONE_ID',
  'WORKER_SUFFIX',
  'CLOUDFLARE_ACCOUNT_ID',
  'GITHUB_OUTPUT',
  'GITHUB_STEP_SUMMARY',
  'GITHUB_SHA',
  'GITHUB_RUN_ID',
  'RELEASE_BASE',
  'RELEASE_HEAD',
  'RELEASE_MIN_SAMPLES',
  'RELEASE_MAX_EXTENSIONS',
  'GUARD_BASE',
  'GUARD_HEAD',
  'GUARD_LABELS',
  // テレメトリの送り先（公開値）。ヘッダ（GRAFANA_OTLP_HEADERS）は secret なので入れない
  'GRAFANA_OTLP_ENDPOINT',
] as const

export type ReleaseConfig = Record<string, string | undefined>

const allowed = new Set<string>(releaseConfigKeys)
const d1IdPattern = /^D1_[A-Z0-9_]+_ID$/
const faroUrlPattern = /^FARO_URL_[A-Z0-9_]+$/

const isAllowedKey = (key: string): boolean =>
  allowed.has(key) || d1IdPattern.test(key) || faroUrlPattern.test(key)

/**
 * GitHub environment の vars（`toJSON(vars)` を RELEASE_VARS で渡す）と、許可リストの環境変数を
 * 重ねた設定を作る。環境変数が優先。許可リストに無いキーは捨てる（ツールが増えても
 * `D1_<TOOL>_ID` は vars から自動で入る）。
 */
export const readReleaseConfig = (input: {
  varsJson: string | undefined
  values: Record<string, string | undefined>
}): ReleaseConfig => {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.varsJson ?? '{}')
  } catch {
    parsed = {}
  }
  const config: ReleaseConfig = {}
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (isAllowedKey(key) && typeof value === 'string') config[key] = value
    }
  }
  for (const [key, value] of Object.entries(input.values)) {
    if (isAllowedKey(key) && value !== undefined) config[key] = value
  }
  return config
}

export const readEnvironment = (
  config: ReleaseConfig,
  credentials: { hasApiToken: boolean },
): Result<DeployEnv, string> => {
  const errors: string[] = []
  const need = (key: string): string => {
    const value = config[key]
    if (value === undefined || value === '') errors.push(`${key} is not set`)
    return value ?? ''
  }

  const rawName = need('RIMLTOOLS_ENV')
  if (rawName !== '' && !isEnvName(rawName)) {
    errors.push(`RIMLTOOLS_ENV must be staging, production or preview (got "${rawName}")`)
  }
  const baseDomain = need('BASE_DOMAIN')
  const zoneId = need('CF_ZONE_ID')
  const accountId = need('CLOUDFLARE_ACCOUNT_ID')
  if (!credentials.hasApiToken) errors.push('CLOUDFLARE_API_TOKEN is not set')
  // suffix は production では置かれない（GitHub の variable は空にできない）ので need() を通さない
  const suffix = config['WORKER_SUFFIX'] ?? ''

  if (rawName === 'production' && suffix !== '') {
    errors.push('WORKER_SUFFIX must be empty in production')
  }
  if ((rawName === 'staging' || rawName === 'preview') && suffix === '') {
    errors.push(`WORKER_SUFFIX must be set in ${rawName} so it never touches production workers`)
  }

  if (errors.length > 0 || !isEnvName(rawName)) return { ok: false, error: errors.join('\n') }
  return {
    ok: true,
    value: {
      name: rawName,
      suffix,
      baseDomain,
      zoneId,
      accountId,
      d1Id: (tool) => {
        const value = config[d1IdVariable(tool)]
        return value === undefined || value === '' ? undefined : value
      },
    },
  }
}

/** staging を Cloudflare Access で閉じている場合の service token のヘッダ（smoke / synthetic 用） */
export const accessHeaders = (
  clientId: string | undefined,
  clientSecret: string | undefined,
): Record<string, string> => {
  if (
    clientId === undefined
    || clientId === ''
    || clientSecret === undefined
    || clientSecret === ''
  ) {
    return {}
  }
  return { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret }
}
