import { describe, expect, test } from 'bun:test'

import {
  currentStable,
  parseDeployments,
  parseWranglerOutput,
  versionSpecs,
} from './deployments.ts'

const deployments = [
  {
    id: 'd3',
    created_on: '3',
    versions: [
      { version_id: 'new', percentage: 10 },
      { version_id: 'v2', percentage: 90 },
    ],
  },
  { id: 'd2', created_on: '2', versions: [{ version_id: 'v2', percentage: 100 }] },
  { id: 'd1', created_on: '1', versions: [{ version_id: 'v1', percentage: 100 }] },
]

describe('parseDeployments', () => {
  test('reads the REST response newest first', () => {
    const result = parseDeployments({
      success: true,
      result: { deployments: deployments.toReversed() },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((d) => d.id)).toEqual(['d3', 'd2', 'd1'])
  })
})

describe('currentStable', () => {
  test('is the version carrying the most traffic that is not the candidate', () => {
    const parsed = parseDeployments({ success: true, result: { deployments } })
    if (!parsed.ok) return
    expect(currentStable(parsed.value, 'new')).toBe('v2')
  })

  test('falls back to the last fully deployed version when the latest split has no other version', () => {
    const parsed = parseDeployments({
      success: true,
      result: {
        deployments: [
          { id: 'x', created_on: '9', versions: [{ version_id: 'new', percentage: 100 }] },
          ...deployments,
        ],
      },
    })
    if (!parsed.ok) return
    expect(currentStable(parsed.value, 'new')).toBe('v2')
  })

  test('is undefined for a worker that was never deployed', () => {
    expect(currentStable([], 'new')).toBeUndefined()
  })
})

describe('versionSpecs', () => {
  test('splits traffic between the candidate and the stable version', () => {
    expect(versionSpecs('new', 'old', 10)).toEqual(['new@10%', 'old@90%'])
    expect(versionSpecs('new', 'old', 0)).toEqual(['new@0%', 'old@100%'])
    expect(versionSpecs('new', 'old', 100)).toEqual(['new@100%'])
    expect(versionSpecs('new', undefined, 10)).toEqual(['new@100%'])
  })
})

describe('parseWranglerOutput', () => {
  test('picks the version-upload entry', () => {
    const ndjson = [
      '{"type":"wrangler-session","version":1}',
      '{"type":"version-upload","version":1,"worker_name":"w","version_id":"abc","preview_url":"https://abc-w.x.workers.dev","preview_alias_url":"https://pr-1-w.x.workers.dev"}',
      '',
    ].join('\n')
    const result = parseWranglerOutput(ndjson, 'version-upload')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value['version_id']).toBe('abc')
    expect(result.value['preview_alias_url']).toBe('https://pr-1-w.x.workers.dev')
  })

  test('surfaces command-failed', () => {
    const result = parseWranglerOutput(
      '{"type":"command-failed","message":"auth"}',
      'version-upload',
    )
    expect(result.ok).toBe(false)
  })
})
