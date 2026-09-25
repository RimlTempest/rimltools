import { describe, expect, test } from 'bun:test'

import type { Registry } from '../lib/tools.ts'
import {
  BASIC_FIELDS,
  EXTENDED_FIELDS,
  buildD1Query,
  d1Samples,
  mergeSamples,
  buildWorkersQuery,
  isSchemaError,
  parseD1Groups,
  parseWorkersGroups,
  scriptIdentity,
  settledWindows,
  statusClass,
  toSamples,
  type WorkersGroup,
  workersQueryVariables,
} from './metrics.ts'
import { toOtlpMetrics } from './otlp.ts'

const registry: Registry = {
  domain: 'tools.example.com',
  zone: 'example.com',
  tools: [
    {
      name: 'qrcc',
      title: 'QR',
      description: 'd',
      path: 'apps/qrcc',
      subdomain: 'qrcc',
      apex: false,
      listed: true,
      host: 'qrcc.tools.example.com',
      legacyHosts: [],
      appSecrets: [],
      fixedDevPort: null,
      rust: true,
      services: [
        { name: 'qrcc-api', role: 'internal', buildConfig: 'a', durableObjects: false },
        { name: 'qrcc-web', role: 'public', buildConfig: 'b', durableObjects: false },
      ],
      d1: [{ name: 'qrcc', binding: 'DB', migrationsConfig: 'x' }],
      release: { mode: 'canary', steps: [10, 50, 100], bakeMinutes: 10 },
      slo: { availability: 99.5, windowDays: 28 },
      smoke: { cli: 'c', browser: 'b', e2ePackage: 'e' },
    },
  ],
}

describe('settledWindows', () => {
  test('returns aligned windows that ended at least settleMinutes ago, oldest first', () => {
    const now = new Date('2026-09-22T10:17:30Z')
    const windows = settledWindows(now, { windowMinutes: 5, settleMinutes: 10, count: 3 })
    expect(windows.map((w) => [w.start.toISOString(), w.end.toISOString()])).toEqual([
      ['2026-09-22T09:50:00.000Z', '2026-09-22T09:55:00.000Z'],
      ['2026-09-22T09:55:00.000Z', '2026-09-22T10:00:00.000Z'],
      ['2026-09-22T10:00:00.000Z', '2026-09-22T10:05:00.000Z'],
    ])
  })
})

describe('buildWorkersQuery', () => {
  test('requests the extended fields and filters by the window', () => {
    const query = buildWorkersQuery(EXTENDED_FIELDS)
    expect(query).toContain('workersInvocationsAdaptive')
    expect(query).toContain('datetime_geq: $start')
    expect(query).toContain('scriptVersion')
    expect(query).toContain('wallTimeP99')
  })

  test('uses the documented inclusive filter and stops one second before the next window', () => {
    expect(buildWorkersQuery(BASIC_FIELDS)).toContain('datetime_leq: $end')
    const vars = workersQueryVariables('acc', {
      start: new Date('2026-09-22T10:00:00Z'),
      end: new Date('2026-09-22T10:05:00Z'),
    })
    expect(vars).toEqual({
      accountTag: 'acc',
      start: '2026-09-22T10:00:00.000Z',
      end: '2026-09-22T10:04:59.000Z',
    })
  })

  test('the basic field set only uses fields documented by Cloudflare', () => {
    const query = buildWorkersQuery(BASIC_FIELDS)
    expect(query).not.toContain('scriptVersion')
    expect(query).not.toContain('wallTime')
    expect(query).toContain('cpuTimeP99')
  })
})

describe('isSchemaError', () => {
  test('detects GraphQL validation errors about unknown fields', () => {
    expect(isSchemaError([{ message: 'unknown field "wallTimeP99" on type "Quantiles"' }])).toBe(
      true,
    )
    expect(isSchemaError([{ message: 'Cannot query field "scriptVersion"' }])).toBe(true)
    expect(isSchemaError([{ message: 'rate limited' }])).toBe(false)
  })
})

const workersResponse = {
  data: {
    viewer: {
      accounts: [
        {
          workersInvocationsAdaptive: [
            {
              sum: { requests: 100, errors: 2, subrequests: 30 },
              quantiles: { cpuTimeP50: 1.5, cpuTimeP99: 9, wallTimeP99: 120 },
              dimensions: { scriptName: 'qrcc-web', scriptVersion: 'v1', status: 'success' },
            },
            {
              sum: { requests: 3, errors: 3, subrequests: 0 },
              quantiles: { cpuTimeP50: 2, cpuTimeP99: 4 },
              dimensions: { scriptName: 'qrcc-web-staging', status: 'scriptThrewException' },
            },
            { sum: { requests: 'x' }, dimensions: {} },
          ],
        },
      ],
    },
  },
}

describe('parseWorkersGroups', () => {
  test('keeps well-formed groups and drops malformed ones', () => {
    const groups = parseWorkersGroups(workersResponse)
    expect(groups.ok).toBe(true)
    if (!groups.ok) return
    expect(groups.value).toHaveLength(2)
    expect(groups.value[0]?.quantiles['wallTimeP99']).toBe(120)
    expect(groups.value[1]?.scriptVersion).toBe('')
  })

  test('returns the GraphQL errors', () => {
    const result = parseWorkersGroups({ errors: [{ message: 'unknown field "x"' }] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.schema).toBe(true)
  })
})

describe('scriptIdentity / statusClass', () => {
  test('maps a script to its tool and environment', () => {
    expect(scriptIdentity(registry, 'qrcc-web')).toEqual({
      tool: 'qrcc',
      environment: 'production',
    })
    expect(scriptIdentity(registry, 'qrcc-api-staging')).toEqual({
      tool: 'qrcc',
      environment: 'staging',
    })
    expect(scriptIdentity(registry, 'someone-else')).toEqual({
      tool: 'unknown',
      environment: 'unknown',
    })
  })

  test('client disconnects are not server errors', () => {
    expect(statusClass('success')).toBe('ok')
    expect(statusClass('clientDisconnected')).toBe('ok')
    expect(statusClass('scriptThrewException')).toBe('error')
    expect(statusClass('exceededResources')).toBe('error')
  })
})

describe('toSamples', () => {
  test('emits one gauge per metric and quantile, stamped at the window end', () => {
    const parsed = parseWorkersGroups(workersResponse)
    if (!parsed.ok) throw new Error('fixture')
    const groups: WorkersGroup[] = parsed.value
    const window = {
      start: new Date('2026-09-22T10:00:00Z'),
      end: new Date('2026-09-22T10:05:00Z'),
    }
    const samples = toSamples(registry, groups, window)
    const requests = samples.find(
      (s) => s.name === 'rimltools_worker_requests' && s.labels['script'] === 'qrcc-web',
    )
    expect(requests).toEqual({
      name: 'rimltools_worker_requests',
      value: 100,
      timestampMs: Date.parse('2026-09-22T10:05:00Z'),
      labels: {
        tool: 'qrcc',
        environment: 'production',
        script: 'qrcc-web',
        version: 'v1',
        status_class: 'ok',
      },
    })
    const wallP99 = samples.find(
      (s) => s.name === 'rimltools_worker_wall_time_ms' && s.labels['quantile'] === '0.99',
    )
    expect(wallP99?.value).toBe(120)
    // 取れなかった分位点は出さない
    const stagingWall = samples.filter(
      (s) =>
        s.name === 'rimltools_worker_wall_time_ms' && s.labels['script'] === 'qrcc-web-staging',
    )
    expect(stagingWall).toEqual([])
  })
})

describe('D1', () => {
  test('builds a daily query and parses rows read / written per database', () => {
    expect(buildD1Query()).toContain('d1AnalyticsAdaptiveGroups')
    const result = parseD1Groups({
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: [
                { sum: { rowsRead: 10, rowsWritten: 2 }, dimensions: { databaseId: 'db1' } },
              ],
            },
          ],
        },
      },
    })
    expect(result).toEqual({
      ok: true,
      value: [{ databaseId: 'db1', rowsRead: 10, rowsWritten: 2 }],
    })
  })
})

describe('toOtlpMetrics', () => {
  test('builds an OTLP/JSON gauge payload grouped by metric name', () => {
    const payload = toOtlpMetrics(
      [
        { name: 'm', value: 1, timestampMs: 1000, labels: { a: 'x' } },
        { name: 'm', value: 2, timestampMs: 2000, labels: { a: 'y' } },
      ],
      { 'service.name': 'rimltools-metrics-push', 'service.namespace': 'rimltools' },
    )
    const [resource] = payload.resourceMetrics
    expect(resource?.resource.attributes).toContainEqual({
      key: 'service.namespace',
      value: { stringValue: 'rimltools' },
    })
    const [metric] = resource?.scopeMetrics[0]?.metrics ?? []
    expect(metric?.name).toBe('m')
    expect(metric?.gauge.dataPoints).toEqual([
      {
        asDouble: 1,
        timeUnixNano: '1000000000',
        attributes: [{ key: 'a', value: { stringValue: 'x' } }],
      },
      {
        asDouble: 2,
        timeUnixNano: '2000000000',
        attributes: [{ key: 'a', value: { stringValue: 'y' } }],
      },
    ])
  })
})

describe('mergeSamples', () => {
  test('sums counts and keeps the worse quantile for identical label sets', () => {
    const base = { timestampMs: 1, labels: { tool: 'qrcc', status_class: 'error' } }
    const merged = mergeSamples([
      { ...base, name: 'rimltools_worker_errors', value: 2 },
      { ...base, name: 'rimltools_worker_errors', value: 3 },
      { ...base, name: 'q', value: 10, labels: { ...base.labels, quantile: '0.99' } },
      { ...base, name: 'q', value: 40, labels: { ...base.labels, quantile: '0.99' } },
    ])
    expect(merged.map((s) => [s.name, s.value])).toEqual([
      ['rimltools_worker_errors', 5],
      ['q', 40],
    ])
  })
})

describe('d1Samples', () => {
  test('labels databases by name when known', () => {
    const samples = d1Samples(
      [{ databaseId: 'id1', rowsRead: 5, rowsWritten: 1 }],
      new Map([['id1', 'qrcc']]),
      42,
    )
    expect(samples).toEqual([
      {
        name: 'rimltools_d1_rows_read_today',
        value: 5,
        timestampMs: 42,
        labels: { database: 'qrcc' },
      },
      {
        name: 'rimltools_d1_rows_written_today',
        value: 1,
        timestampMs: 42,
        labels: { database: 'qrcc' },
      },
    ])
  })
})
