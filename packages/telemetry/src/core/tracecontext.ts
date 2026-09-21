/**
 * W3C Trace Context（traceparent）の読み書き。
 * https://www.w3.org/TR/trace-context/#traceparent-header
 */

import type { Result } from './result.ts'

export type ParentContext = {
  readonly traceId: string
  readonly parentSpanId: string
  readonly sampled: boolean
}

export type SpanContext = {
  readonly traceId: string
  readonly spanId: string
  readonly sampled: boolean
}

/** `crypto.getRandomValues` と同じ形。テストでは固定値を返す。 */
export type FillRandom = (bytes: Uint8Array) => Uint8Array

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/

const isZero = (hex: string) => /^0+$/.test(hex)

export const parseTraceparent = (header: string | null): Result<ParentContext, string> => {
  const match = TRACEPARENT.exec((header ?? '').trim())
  if (match === null) return { ok: false, error: 'malformed traceparent' }
  const [, version = '', traceId = '', parentSpanId = '', flags = '', rest] = match
  if (version === 'ff') return { ok: false, error: 'invalid version' }
  // version 00 は後ろに何も付かない
  if (version === '00' && rest !== undefined) return { ok: false, error: 'trailing data' }
  if (isZero(traceId) || isZero(parentSpanId)) return { ok: false, error: 'all-zero id' }
  // flags の最下位ビットが sampled
  const sampled = Number.parseInt(flags, 16) % 2 === 1
  return { ok: true, value: { traceId, parentSpanId, sampled } }
}

export const formatTraceparent = (context: SpanContext): string =>
  `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const randomHex = (fill: FillRandom, length: number) => {
  const hex = toHex(fill(new Uint8Array(length)))
  // 全ゼロは無効な ID（仕様）。乱数源が壊れていても有効な値にする
  return isZero(hex) ? `${hex.slice(0, -1)}1` : hex
}

export const newTraceId = (fill: FillRandom): string => randomHex(fill, 16)

export const newSpanId = (fill: FillRandom): string => randomHex(fill, 8)
