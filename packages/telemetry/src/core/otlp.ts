/**
 * span / ログの記録を OTLP/HTTP JSON に変換する（OpenTelemetry SDK を使わない軽量実装）。
 * https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding
 *
 * - traceId / spanId は hex 文字列（OTLP/JSON の規定）
 * - 時刻は nanosecond の 10 進文字列（number だと 2^53 を超えて精度が落ちる）
 * - enum は整数
 */

import type { Resource } from './config.ts'

export type AttributeValue = string | number | boolean

export type Attributes = Readonly<Record<string, AttributeValue>>

export type SpanKind = 'internal' | 'server' | 'client'

export type SpanStatus =
  | { readonly code: 'unset' }
  | { readonly code: 'ok' }
  | { readonly code: 'error'; readonly message?: string }

export type SpanEvent = {
  readonly name: string
  readonly timeMs: number
  readonly attributes: Attributes
}

export type SpanRecord = {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly kind: SpanKind
  readonly startMs: number
  readonly endMs: number
  readonly attributes: Attributes
  readonly status: SpanStatus
  readonly events: readonly SpanEvent[]
}

export type Severity = 'debug' | 'info' | 'warn' | 'error'

export type LogRecord = {
  readonly timeMs: number
  readonly severity: Severity
  readonly body: string
  readonly attributes: Attributes
  readonly traceId: string | undefined
  readonly spanId: string | undefined
}

type AnyValue =
  | { readonly stringValue: string }
  | { readonly intValue: string }
  | { readonly doubleValue: number }
  | { readonly boolValue: boolean }

type KeyValue = { readonly key: string; readonly value: AnyValue }

export const SCOPE = { name: '@rimltools/telemetry', version: '0.1.0' } as const

const KIND = { internal: 1, server: 2, client: 3 } as const
const STATUS = { unset: 0, ok: 1, error: 2 } as const
const SEVERITY = {
  debug: { number: 5, text: 'DEBUG' },
  info: { number: 9, text: 'INFO' },
  warn: { number: 13, text: 'WARN' },
  error: { number: 17, text: 'ERROR' },
} as const

const nanos = (ms: number): string => (BigInt(Math.round(ms)) * 1_000_000n).toString()

const anyValue = (value: AttributeValue): AnyValue => {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { boolValue: value }
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
}

const keyValues = (attributes: Attributes): KeyValue[] =>
  Object.entries(attributes).map(([key, value]) => ({ key, value: anyValue(value) }))

const otlpStatus = (status: SpanStatus) =>
  status.code === 'error' && status.message !== undefined
    ? { code: STATUS.error, message: status.message }
    : { code: STATUS[status.code] }

const otlpSpan = (span: SpanRecord) => ({
  traceId: span.traceId,
  spanId: span.spanId,
  ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
  name: span.name,
  kind: KIND[span.kind],
  startTimeUnixNano: nanos(span.startMs),
  endTimeUnixNano: nanos(span.endMs),
  attributes: keyValues(span.attributes),
  status: otlpStatus(span.status),
  events: span.events.map((event) => ({
    name: event.name,
    timeUnixNano: nanos(event.timeMs),
    attributes: keyValues(event.attributes),
  })),
})

export const toOtlpTraces = (resource: Resource, spans: readonly SpanRecord[]) => ({
  resourceSpans: [
    {
      resource: { attributes: keyValues(resource) },
      scopeSpans: [{ scope: SCOPE, spans: spans.map(otlpSpan) }],
    },
  ],
})

const otlpLog = (log: LogRecord) => ({
  timeUnixNano: nanos(log.timeMs),
  observedTimeUnixNano: nanos(log.timeMs),
  severityNumber: SEVERITY[log.severity].number,
  severityText: SEVERITY[log.severity].text,
  body: { stringValue: log.body },
  attributes: keyValues(log.attributes),
  ...(log.traceId === undefined ? {} : { traceId: log.traceId }),
  ...(log.spanId === undefined ? {} : { spanId: log.spanId }),
})

export const toOtlpLogs = (resource: Resource, logs: readonly LogRecord[]) => ({
  resourceLogs: [
    {
      resource: { attributes: keyValues(resource) },
      scopeLogs: [{ scope: SCOPE, logRecords: logs.map(otlpLog) }],
    },
  ],
})
