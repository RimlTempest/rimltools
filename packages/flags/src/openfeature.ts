/**
 * OpenFeature の Provider（server）として使うためのアダプタ。
 *
 * `@openfeature/server-sdk` は `node:async_hooks` / `events` を読むため、実行時には依存しない
 * （型だけ使う）。SDK 経由で使いたい場合は `nodejs_compat` を有効にした Worker で
 * `OpenFeature.setProvider(createD1FlagProvider(...))` する。SDK を使わない場合は
 * `createFlagClient`（index.ts）を直接呼べばよい。
 */
import { ErrorCode } from '@openfeature/core'
import type {
  EvaluationContext as OpenFeatureContext,
  JsonValue,
  Provider,
  ResolutionDetails,
} from '@openfeature/server-sdk'

import { createFlagClient } from './client.ts'
import type { ExposureMode, FlagErrorCode, FlagResult } from './client.ts'
import type { ContextValue, EvaluationContext } from './core/types.ts'
import { createD1FlagStore } from './store.ts'
import type { CacheLike, D1Like, FlagLog } from './store.ts'

export type D1FlagProviderOptions = {
  db: D1Like
  cache?: CacheLike
  tool: string
  ttlSeconds?: number
  log?: FlagLog
  exposure?: ExposureMode
}

const ERROR_CODES: Record<FlagErrorCode, ErrorCode> = {
  FLAG_NOT_FOUND: ErrorCode.FLAG_NOT_FOUND,
  TYPE_MISMATCH: ErrorCode.TYPE_MISMATCH,
  PARSE_ERROR: ErrorCode.PARSE_ERROR,
  GENERAL: ErrorCode.GENERAL,
}

const isContextValue = (value: unknown): value is ContextValue =>
  typeof value === 'string'
  || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value))
  || (Array.isArray(value)
    && value.every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))))

/** 評価器が扱える値（文字列・数値・真偽・その配列）だけを残す */
const toContext = (context: OpenFeatureContext): EvaluationContext => {
  const out: EvaluationContext = {}
  for (const [key, value] of Object.entries(context)) {
    if (isContextValue(value)) out[key] = value
  }
  return out
}

const toDetails = <T>(result: FlagResult<T>): ResolutionDetails<T> =>
  result.reason === 'ERROR'
    ? { value: result.value, reason: 'ERROR', errorCode: ERROR_CODES[result.errorCode] }
    : { value: result.value, variant: result.variant, reason: result.reason }

const isJsonObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** D1 の `feature_flags` を読む OpenFeature Provider（ADR-0004） */
export const createD1FlagProvider = (options: D1FlagProviderOptions): Provider => {
  const log = options.log ?? ((entry) => console.warn(JSON.stringify(entry)))
  const store = createD1FlagStore({
    db: options.db,
    tool: options.tool,
    ttlSeconds: options.ttlSeconds ?? 60,
    log,
    ...(options.cache === undefined ? {} : { cache: options.cache }),
  })
  const client = createFlagClient({
    store,
    tool: options.tool,
    log,
    ...(options.exposure === undefined ? {} : { exposure: options.exposure }),
  })

  return {
    metadata: { name: 'rimltools-d1' },
    runsOn: 'server',
    resolveBooleanEvaluation: async (key, fallback, ctx) =>
      toDetails(await client.boolean(key, fallback, toContext(ctx))),
    resolveStringEvaluation: async (key, fallback, ctx) =>
      toDetails(await client.string(key, fallback, toContext(ctx))),
    resolveNumberEvaluation: async (key, fallback, ctx) =>
      toDetails(await client.number(key, fallback, toContext(ctx))),
    resolveObjectEvaluation: async <T extends JsonValue>(
      key: string,
      fallback: T,
      ctx: OpenFeatureContext,
    ): Promise<ResolutionDetails<T>> => {
      // object flag はオブジェクトしか返さない。既定値がオブジェクトでなければ型不一致。
      if (!isJsonObject(fallback)) {
        return { value: fallback, reason: 'ERROR', errorCode: ErrorCode.TYPE_MISMATCH }
      }
      const details = toDetails(await client.object(key, fallback, toContext(ctx)))
      const { value } = details
      if (isSameShape(fallback, value)) return { ...details, value }
      return { value: fallback, reason: 'ERROR', errorCode: ErrorCode.TYPE_MISMATCH }
    },
  }
}

/** 評価結果が、既定値 `T` と同じ種類（JSON オブジェクト）であること */
const isSameShape = <T extends JsonValue>(_fallback: T, value: JsonValue): value is T =>
  isJsonObject(value)
