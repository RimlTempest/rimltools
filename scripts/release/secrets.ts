/**
 * `wrangler versions upload --secrets-file` で、その版に載せる secret を決める（純関数）。
 *
 * - OTLP のヘッダ（`GRAFANA_OTLP_HEADERS`）: 送り先が入っている Worker にだけ
 * - アプリの secret（environment secret `APP_SECRETS`、`{ "<tool>": { "<NAME>": "<value>" } }`）:
 *   そのツールの public Worker にだけ。staging / preview を廃止したので、いまはどの環境にも書かれない
 *
 * `versions upload` は secrets-file に無い既存の secret を前の版から引き継ぐ（wrangler の
 * uploadWorkerVersion は常に keepSecrets: true）。本番の Worker が持つ secret は触らない。
 * 念のため、本番で APP_SECRETS が渡されたら失敗させる（docs/release.md）。
 *
 * エラー文字列には secret の値を入れない（キー名と形だけ）。
 */

import type { Result } from '../lib/tools.ts'
import type { EnvName } from './environment.ts'
import { needsOtlpSecret } from './rewrite.ts'

const OTLP_HEADERS = 'OTEL_EXPORTER_OTLP_HEADERS'
const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseAppSecrets = (raw: string, tool: string): Result<Record<string, string>, string> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'APP_SECRETS is not JSON' }
  }
  if (!isRecord(parsed)) return { ok: false, error: 'APP_SECRETS must be an object keyed by tool' }
  const entry = parsed[tool]
  if (entry === undefined) return { ok: true, value: {} }
  if (!isRecord(entry)) return { ok: false, error: `APP_SECRETS.${tool} must be an object` }
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(entry)) {
    if (!SECRET_NAME.test(name)) {
      return { ok: false, error: `APP_SECRETS.${tool}: invalid secret name (use A-Z, 0-9, _)` }
    }
    if (name === OTLP_HEADERS) {
      return { ok: false, error: `APP_SECRETS.${tool}.${name} is reserved for telemetry` }
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `APP_SECRETS.${tool}.${name} must be a string` }
    }
    if (value === '') return { ok: false, error: `APP_SECRETS.${tool}.${name} is empty` }
    out[name] = value
  }
  return { ok: true, value: out }
}

export const versionSecrets = (input: {
  env: EnvName
  tool: string
  /** suffix 込みの public Worker 名（書き換え後の wrangler.json の name と比べる） */
  publicWorkerName: string
  /** 書き換え後の wrangler.json */
  config: Json
  otlpHeaders: string
  appSecretsJson: string
}): Result<Record<string, string>, string> => {
  const secrets: Record<string, string> = {}
  if (input.otlpHeaders !== '' && needsOtlpSecret(input.config)) {
    secrets[OTLP_HEADERS] = input.otlpHeaders
  }

  if (input.appSecretsJson === '') return { ok: true, value: secrets }
  if (input.env === 'production') {
    return {
      ok: false,
      error: 'APP_SECRETS must not be set for production (the live Workers keep their own secrets)',
    }
  }
  if (input.config['name'] !== input.publicWorkerName) return { ok: true, value: secrets }

  const app = parseAppSecrets(input.appSecretsJson, input.tool)
  if (!app.ok) return app
  return { ok: true, value: { ...secrets, ...app.value } }
}
