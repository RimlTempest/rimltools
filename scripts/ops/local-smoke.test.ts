import { describe, expect, test } from 'bun:test'

import {
  faroPayload,
  hasPrometheusSeries,
  lokiLineCount,
  sampleTelemetry,
  tempoHasTrace,
} from './local-smoke.ts'

describe('sampleTelemetry', () => {
  const sample = sampleTelemetry({ nowMs: 1_700_000_000_000, randomHex: (n) => 'a'.repeat(n) })

  test('uses the production resource contract with environment "local"', () => {
    const resource = sample.traces.resourceSpans[0]?.resource.attributes ?? []
    const get = (key: string) => resource.find((a) => a.key === key)?.value
    expect(get('service.name')).toEqual({ stringValue: 'qrcc-web' })
    expect(get('service.namespace')).toEqual({ stringValue: 'rimltools' })
    expect(get('deployment.environment.name')).toEqual({ stringValue: 'local' })
  })

  test('sends one SERVER span and one log line with the same trace id', () => {
    const span = sample.traces.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    expect(span?.traceId).toBe(sample.traceId)
    expect(span?.kind).toBe(2)
    const log = sample.logs.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]
    expect(log?.traceId).toBe(sample.traceId)
    expect(JSON.stringify(log)).toContain(sample.marker)
  })
})

describe('faroPayload', () => {
  test('carries the marker in a log of the tool app', () => {
    const payload = faroPayload({ nowMs: 0, marker: 'm-1', app: 'qrcc' })
    expect(payload.meta.app.name).toBe('qrcc')
    expect(payload.logs[0]?.message).toContain('m-1')
  })
})

describe('response parsers', () => {
  test('tempoHasTrace accepts OTLP JSON with at least one batch', () => {
    expect(tempoHasTrace({ batches: [{}] })).toBe(true)
    expect(tempoHasTrace({ resourceSpans: [{}] })).toBe(true)
    expect(tempoHasTrace({ batches: [] })).toBe(false)
    expect(tempoHasTrace('nope')).toBe(false)
  })

  test('lokiLineCount counts lines across streams', () => {
    expect(
      lokiLineCount({
        data: {
          result: [
            {
              values: [
                ['1', 'a'],
                ['2', 'b'],
              ],
            },
            { values: [['3', 'c']] },
          ],
        },
      }),
    ).toBe(3)
    expect(lokiLineCount({ data: { result: [] } })).toBe(0)
    expect(lokiLineCount(null)).toBe(0)
  })

  test('hasPrometheusSeries is true only for a non-empty vector', () => {
    expect(hasPrometheusSeries({ data: { result: [{ value: [1, '3'] }] } })).toBe(true)
    expect(hasPrometheusSeries({ data: { result: [] } })).toBe(false)
    expect(hasPrometheusSeries({})).toBe(false)
  })
})
