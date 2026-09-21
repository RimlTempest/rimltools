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
  apiToken: string
  /** ツールの D1 の id（`D1_<TOOL>_ID`）。環境ごとに別の DB を指す */
  d1Id: (tool: string) => string | undefined
}

const isEnvName = (value: string): value is EnvName =>
  value === 'staging' || value === 'production' || value === 'preview'

export const d1IdVariable = (tool: string): string =>
  `D1_${tool.toUpperCase().replaceAll('-', '_')}_ID`

export const readEnvironment = (
  vars: Record<string, string | undefined>,
): Result<DeployEnv, string> => {
  const errors: string[] = []
  const need = (key: string): string => {
    const value = vars[key]
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
  const apiToken = need('CLOUDFLARE_API_TOKEN')
  // suffix は production では空文字が正しいので need() を通さない
  const suffix = vars['WORKER_SUFFIX'] ?? ''

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
      apiToken,
      d1Id: (tool) => {
        const value = vars[d1IdVariable(tool)]
        return value === undefined || value === '' ? undefined : value
      },
    },
  }
}

/**
 * workflow から `toJSON(vars)` を RELEASE_VARS で受け取り、環境変数に重ねる。
 * ツールが増えても `D1_<TOOL>_ID` を workflow に書き足さなくて済む。
 * 実際の環境変数（secrets を含む）が優先。
 */
export const mergeVariables = (
  varsJson: string | undefined,
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(varsJson ?? '{}')
  } catch {
    parsed = {}
  }
  const fromVars: Record<string, string> = {}
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') fromVars[key] = value
    }
  }
  return { ...fromVars, ...environment }
}

/** staging を Cloudflare Access で閉じている場合の service token（smoke / synthetic 用） */
export const accessHeaders = (
  environment: Record<string, string | undefined>,
): Record<string, string> => {
  const id = environment['CF_ACCESS_CLIENT_ID']
  const secret = environment['CF_ACCESS_CLIENT_SECRET']
  if (id === undefined || id === '' || secret === undefined || secret === '') return {}
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
}
