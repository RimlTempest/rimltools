import { describe, expect, test } from 'bun:test'

import type { Stats } from './analysis.ts'
import {
  graphqlVersionField,
  introspectionQuery,
  observabilityQuery,
  outcomeKeyCandidates,
  parseObservabilityKeys,
  parseObservabilityStats,
  pickKey,
  selectSource,
  versionKeyCandidates,
} from './sources.ts'

const introspected = (fields: string[]) => ({
  data: { __type: { name: 'X', fields: fields.map((name) => ({ name })) } },
})

const group = (version: string, outcome: string, count: number) => ({
  count,
  value: count,
  interval: 60,
  sampleInterval: 1,
  groups: [
    { key: '$workers.scriptVersion.id', value: version },
    { key: '$workers.outcome', value: outcome },
  ],
})

describe('graphqlVersionField', () => {
  test('finds a version dimension on workersInvocationsAdaptive', () => {
    expect(graphqlVersionField(introspected(['scriptName', 'scriptVersion', 'status']))).toBe(
      'scriptVersion',
    )
    expect(graphqlVersionField(introspected(['scriptName', 'scriptVersionId']))).toBe(
      'scriptVersionId',
    )
  })

  test('is undefined when the schema has no version dimension', () => {
    expect(graphqlVersionField(introspected(['scriptName', 'status', 'datetime']))).toBeUndefined()
    expect(graphqlVersionField({ data: { __type: null } })).toBeUndefined()
    expect(graphqlVersionField({ errors: [{ message: 'no' }] })).toBeUndefined()
  })

  test('introspects the dimensions type by name', () => {
    expect(introspectionQuery).toContain(
      '__type(name: "AccountWorkersInvocationsAdaptiveDimensions")',
    )
  })
})

describe('Workers Observability keys', () => {
  const keys = {
    success: true,
    errors: [],
    messages: [],
    result: [
      { key: '$metadata.service', type: 'string', lastSeenAt: 1 },
      { key: '$workers.scriptVersion.id', type: 'string', lastSeenAt: 1 },
      { key: '$workers.outcome', type: 'string', lastSeenAt: 1 },
    ],
  }

  test('reads the key list', () => {
    expect(parseObservabilityKeys(keys)).toEqual({
      ok: true,
      value: ['$metadata.service', '$workers.scriptVersion.id', '$workers.outcome'],
    })
    expect(parseObservabilityKeys({ success: false, errors: [{ message: 'x' }] }).ok).toBe(false)
  })

  test('picks the first candidate the dataset actually has', () => {
    // 候補名はここで固定する（名前が変わったら落ちて気づけるように）
    expect(versionKeyCandidates).toEqual([
      '$workers.scriptVersion.id',
      '$workers.scriptVersionId',
      '$metadata.scriptVersion',
    ])
    expect(outcomeKeyCandidates).toEqual(['$workers.outcome', '$metadata.outcome'])
    const available = ['$metadata.service', '$workers.scriptVersion.id', '$workers.outcome']
    expect(pickKey(versionKeyCandidates, available)).toBe('$workers.scriptVersion.id')
    expect(pickKey(outcomeKeyCandidates, available)).toBe('$workers.outcome')
    expect(pickKey(versionKeyCandidates, ['$metadata.service'])).toBeUndefined()
  })
})

describe('observabilityQuery', () => {
  test('counts invocation logs of one worker grouped by version and outcome', () => {
    const body = observabilityQuery({
      worker: 'qrcc-web',
      versionKey: '$workers.scriptVersion.id',
      outcomeKey: '$workers.outcome',
      since: new Date(1000),
      until: new Date(2000),
    })
    expect(body.view).toBe('calculations')
    expect(body.timeframe).toEqual({ from: 1000, to: 2000 })
    expect(body.parameters.calculations).toEqual([{ operator: 'count', alias: 'invocations' }])
    expect(body.parameters.groupBys).toEqual([
      { type: 'string', value: '$workers.scriptVersion.id' },
      { type: 'string', value: '$workers.outcome' },
    ])
    expect(body.parameters.filters).toContainEqual({
      key: '$metadata.service',
      operation: 'eq',
      type: 'string',
      value: 'qrcc-web',
    })
    expect(body.parameters.filters).toContainEqual({
      key: '$metadata.type',
      operation: 'eq',
      type: 'string',
      value: 'cf-worker-event',
    })
  })
})

describe('parseObservabilityStats', () => {
  test('turns outcome groups into per-version requests and errors', () => {
    const response = {
      success: true,
      errors: [],
      messages: [],
      result: {
        calculations: [
          {
            alias: 'invocations',
            calculation: 'count',
            aggregates: [
              group('new', 'ok', 90),
              group('new', 'exception', 6),
              group('new', 'canceled', 4),
              group('old', 'ok', 900),
              group('old', 'exceededCpu', 3),
            ],
            series: [],
          },
        ],
      },
    }
    const result = parseObservabilityStats(response, {
      versionKey: '$workers.scriptVersion.id',
      outcomeKey: '$workers.outcome',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // canceled はクライアント切断なので失敗に数えない
    expect(result.value.get('new')).toEqual<Stats>({ requests: 100, errors: 6 })
    expect(result.value.get('old')).toEqual<Stats>({ requests: 903, errors: 3 })
  })

  test('reports API errors', () => {
    const result = parseObservabilityStats(
      { success: false, errors: [{ message: 'forbidden' }] },
      { versionKey: 'v', outcomeKey: 'o' },
    )
    expect(result.ok).toBe(false)
  })
})

describe('selectSource', () => {
  const stats = new Map<string, Stats>([['new', { requests: 1, errors: 0 }]])
  const graphql = {
    name: 'graphql',
    probe: async () => true,
    stats: async () => ({ ok: true as const, value: stats }),
  }
  const logs = {
    name: 'workers-logs',
    probe: async () => true,
    stats: async () => ({ ok: true as const, value: stats }),
  }
  const no = (name: string) => ({ ...graphql, name, probe: async () => false })

  test('prefers GraphQL when its schema has a version dimension', async () => {
    expect((await selectSource([graphql, logs]))?.name).toBe('graphql')
  })

  test('falls back to Workers Logs', async () => {
    expect((await selectSource([no('graphql'), logs]))?.name).toBe('workers-logs')
  })

  test('is undefined when nothing can split traffic by version', async () => {
    expect(await selectSource([no('graphql'), no('workers-logs')])).toBeUndefined()
  })
})
