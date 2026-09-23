import { describe, expect, test } from 'bun:test'

import { toOtlpLogs, toOtlpTraces, type LogRecord, type SpanRecord } from './otlp.ts'

const resource = { 'service.name': 'qrcc-web', 'service.namespace': 'rimltools' }
const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'

const root: SpanRecord = {
  traceId: TRACE,
  spanId: '00f067aa0ba902b7',
  parentSpanId: undefined,
  name: 'GET /generate',
  kind: 'server',
  startMs: 1_758_000_000_123,
  endMs: 1_758_000_000_150,
  attributes: { 'http.request.method': 'GET', 'http.response.status_code': 200, 'cf.cache': false },
  status: { code: 'unset' },
  events: [],
}

describe('toOtlpTraces', () => {
  test('builds OTLP/JSON with hex ids, int enums and nanosecond strings', () => {
    const body = toOtlpTraces(resource, [
      root,
      {
        ...root,
        spanId: '1111111111111111',
        parentSpanId: root.spanId,
        name: 'qrcc-api render',
        kind: 'client',
        attributes: { ratio: 0.1 },
        status: { code: 'error', message: 'boom' },
        events: [
          {
            name: 'exception',
            timeMs: 1_758_000_000_140,
            attributes: { 'exception.type': 'Error', 'exception.message': 'boom' },
          },
        ],
      },
    ])
    const [resourceSpans] = body.resourceSpans
    expect(resourceSpans?.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'qrcc-web' },
    })
    const spans = resourceSpans?.scopeSpans[0]?.spans ?? []
    expect(spans[0]).toMatchObject({
      traceId: TRACE,
      spanId: '00f067aa0ba902b7',
      kind: 2,
      startTimeUnixNano: '1758000000123000000',
      endTimeUnixNano: '1758000000150000000',
      status: { code: 0 },
    })
    expect(spans[0]).not.toHaveProperty('parentSpanId')
    expect(spans[0]?.attributes).toEqual([
      { key: 'http.request.method', value: { stringValue: 'GET' } },
      { key: 'http.response.status_code', value: { intValue: '200' } },
      { key: 'cf.cache', value: { boolValue: false } },
    ])
    expect(spans[1]).toMatchObject({
      parentSpanId: '00f067aa0ba902b7',
      kind: 3,
      status: { code: 2, message: 'boom' },
      attributes: [{ key: 'ratio', value: { doubleValue: 0.1 } }],
    })
    expect(spans[1]?.events[0]).toMatchObject({
      name: 'exception',
      timeUnixNano: '1758000000140000000',
    })
  })
})

describe('toOtlpLogs', () => {
  test('carries trace and span ids for correlation', () => {
    const log: LogRecord = {
      timeMs: 1_758_000_000_130,
      severity: 'error',
      body: 'render failed',
      attributes: { 'rpc.method': 'render' },
      traceId: TRACE,
      spanId: '00f067aa0ba902b7',
    }
    const body = toOtlpLogs(resource, [log])
    const record = body.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]
    expect(record).toMatchObject({
      timeUnixNano: '1758000000130000000',
      severityNumber: 17,
      severityText: 'ERROR',
      body: { stringValue: 'render failed' },
      traceId: TRACE,
      spanId: '00f067aa0ba902b7',
    })
  })
})
