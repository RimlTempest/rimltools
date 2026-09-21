/**
 * Worker → ブラウザへ渡す Faro の設定。Worker が HTML の <head> に meta として埋め込み、
 * ブラウザ側（`@rimltools/telemetry/browser`）が読む。値はすべて公開してよいものだけ。
 *
 * | env              | 意味                                             |
 * | ---------------- | ------------------------------------------------ |
 * | FARO_URL         | Grafana Faro の collector URL（公開値）。無ければ無効 |
 * | FARO_SAMPLE_RATE | セッションのサンプリング率（既定 0.2）             |
 */

import { envValue } from './config.ts'
import type { Result } from './result.ts'

export type BrowserConfig = {
  readonly url: string
  readonly app: string
  readonly environment: string
  readonly version: string
  readonly sampleRate: number
}

export const BROWSER_META_NAME = 'rimltools-telemetry'

const DEFAULT_SAMPLE_RATE = 0.2

const text = (env: object, key: string): string | undefined => {
  const value = envValue(env, key)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

const rate = (raw: string | undefined): number => {
  const value = Number(raw)
  return raw !== undefined && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_SAMPLE_RATE
}

export const browserConfigFromEnv = (env: object, app: string): BrowserConfig | null => {
  const url = text(env, 'FARO_URL')
  if (url === undefined || !url.startsWith('https://')) return null
  return {
    url,
    app,
    environment: text(env, 'DEPLOYMENT_ENV') ?? 'production',
    version: text(env, 'GIT_SHA') ?? 'dev',
    sampleRate: rate(text(env, 'FARO_SAMPLE_RATE')),
  }
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

/** <head> に追記する HTML。traceparent は document load を server span に繋ぐ（OTel の慣例） */
export const browserMetaHtml = (config: BrowserConfig, traceparent: string | undefined): string => {
  const meta = `<meta name="${BROWSER_META_NAME}" content="${escapeAttribute(JSON.stringify(config))}">`
  return traceparent === undefined
    ? meta
    : `${meta}<meta name="traceparent" content="${escapeAttribute(traceparent)}">`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseJson = (raw: string): Result<unknown, string> => {
  try {
    const value: unknown = JSON.parse(raw)
    return { ok: true, value }
  } catch {
    return { ok: false, error: 'invalid JSON' }
  }
}

/** meta の content（エスケープを解いたもの）を読む。meta が無ければ null。 */
export const parseBrowserConfig = (raw: string | null): Result<BrowserConfig | null, string> => {
  if (raw === null) return { ok: true, value: null }
  const parsed = parseJson(raw)
  if (!parsed.ok) return parsed
  const value = parsed.value
  if (!isRecord(value)) return { ok: false, error: 'expected an object' }
  const { url, app, environment, version, sampleRate } = value
  if (
    typeof url !== 'string'
    || typeof app !== 'string'
    || typeof environment !== 'string'
    || typeof version !== 'string'
    || typeof sampleRate !== 'number'
  ) {
    return { ok: false, error: 'missing fields' }
  }
  return { ok: true, value: { url, app, environment, version, sampleRate } }
}
