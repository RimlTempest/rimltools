/**
 * Worker の env から送信設定を読む。endpoint が無ければ null（何も送らない）。
 *
 * | env                          | 例                                                     |
 * | ---------------------------- | ------------------------------------------------------ |
 * | OTEL_EXPORTER_OTLP_ENDPOINT  | https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp |
 * | OTEL_EXPORTER_OTLP_HEADERS   | Authorization=Basic%20<base64(instanceId:token)>（secret）|
 * | OTEL_SERVICE_NAME            | qrcc-web（無ければ呼び出し側の既定値）                  |
 * | OTEL_TRACES_SAMPLER_ARG      | 0.1                                                    |
 * | OTEL_SLOW_MS                 | 1000                                                   |
 * | DEPLOYMENT_ENV               | production / staging / preview                         |
 * | GIT_SHA                      | service.version                                        |
 * | CF_VERSION_METADATA          | version metadata binding（id を cloudflare.worker.version_id に） |
 */

import type { Result } from './result.ts'
import { isAllowedCollectorUrl } from './collector-url.ts'

export type Resource = Readonly<Record<string, string>>

export type TelemetryConfig = {
  readonly tracesUrl: string
  readonly logsUrl: string
  readonly headers: Readonly<Record<string, string>>
  readonly ratio: number
  readonly slowMs: number
  readonly resource: Resource
}

const DEFAULT_RATIO = 0.1
const DEFAULT_SLOW_MS = 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** env は各プロダクトの CloudflareEnv（index signature が無い）なので object で受ける */
export const envValue = (env: object, key: string): unknown => Reflect.get(env, key)

const text = (env: object, key: string): string | undefined => {
  const value = envValue(env, key)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

const decode = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

/** OTEL_EXPORTER_OTLP_HEADERS（`k=v,k2=v2`、値は percent-encoding 可）。壊れた項目は捨てる。 */
export const parseHeaders = (raw: string): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const index = entry.indexOf('=')
    if (index <= 0) continue
    const key = entry.slice(0, index).trim()
    const value = decode(entry.slice(index + 1).trim())
    if (key !== '' && value !== undefined && value !== '') headers[key] = value
  }
  return headers
}

const number = (
  env: object,
  key: string,
  fallback: number,
  valid: (n: number) => boolean,
): Result<number, string> => {
  const raw = text(env, key)
  if (raw === undefined) return { ok: true, value: fallback }
  const value = Number(raw)
  return Number.isFinite(value) && valid(value)
    ? { ok: true, value }
    : { ok: false, error: `${key}: invalid value "${raw}"` }
}

export const readConfig = (
  env: object,
  defaults: { readonly serviceName: string },
): Result<TelemetryConfig | null, string> => {
  const endpoint = text(env, 'OTEL_EXPORTER_OTLP_ENDPOINT')
  if (endpoint === undefined) return { ok: true, value: null }
  if (!isAllowedCollectorUrl(endpoint)) {
    return {
      ok: false,
      error: 'OTEL_EXPORTER_OTLP_ENDPOINT must be https (http only for loopback)',
    }
  }
  const ratio = number(env, 'OTEL_TRACES_SAMPLER_ARG', DEFAULT_RATIO, (n) => n >= 0 && n <= 1)
  if (!ratio.ok) return ratio
  const slowMs = number(env, 'OTEL_SLOW_MS', DEFAULT_SLOW_MS, (n) => n > 0)
  if (!slowMs.ok) return slowMs

  const base = endpoint.replace(/\/+$/, '')
  const metadata = envValue(env, 'CF_VERSION_METADATA')
  const versionId =
    isRecord(metadata) && typeof metadata['id'] === 'string' ? metadata['id'] : undefined

  const resource: Record<string, string> = {
    'service.name': text(env, 'OTEL_SERVICE_NAME') ?? defaults.serviceName,
    'service.namespace': 'rimltools',
    'deployment.environment.name': text(env, 'DEPLOYMENT_ENV') ?? 'production',
    'telemetry.sdk.name': '@rimltools/telemetry',
    'telemetry.sdk.language': 'webjs',
    'cloud.provider': 'cloudflare',
    'cloud.platform': 'cloudflare_workers',
  }
  const version = text(env, 'GIT_SHA')
  if (version !== undefined) resource['service.version'] = version
  if (versionId !== undefined) resource['cloudflare.worker.version_id'] = versionId

  return {
    ok: true,
    value: {
      tracesUrl: `${base}/v1/traces`,
      logsUrl: `${base}/v1/logs`,
      headers: parseHeaders(text(env, 'OTEL_EXPORTER_OTLP_HEADERS') ?? ''),
      ratio: ratio.value,
      slowMs: slowMs.value,
      resource,
    },
  }
}
