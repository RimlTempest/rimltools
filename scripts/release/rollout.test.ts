import { describe, expect, test } from 'bun:test'

import type { Stats } from './analysis.ts'
import type { Deployment } from './deployments.ts'
import type { Strategy } from './plan.ts'
import type { RolloutDeps } from './rollout.ts'
import { rolloutWorker } from './rollout.ts'

type World = {
  deployments: Deployment[]
  stats: Map<string, Stats>
  smokeOk: boolean
  calls: string[]
  clock: number
}

const world = (over: Partial<World> = {}): World => ({
  deployments: [{ id: 'd1', createdOn: '1', versions: [{ versionId: 'old', percentage: 100 }] }],
  stats: new Map([
    ['new', { requests: 1000, errors: 1 }],
    ['old', { requests: 9000, errors: 9 }],
  ]),
  smokeOk: true,
  calls: [],
  clock: Date.parse('2026-09-22T00:00:00Z'),
  ...over,
})

const deps = (w: World): RolloutDeps => ({
  log: () => {},
  upload: async () => {
    w.calls.push('upload')
    return { ok: true, value: { versionId: 'new', previewUrl: undefined } }
  },
  deploy: async (_worker, specs) => {
    w.calls.push(`deploy ${specs.join(' ')}`)
    return { ok: true, value: undefined }
  },
  deployDirect: async () => {
    w.calls.push('deploy-direct')
    return { ok: true, value: { versionId: 'new' } }
  },
  deployments: async () => ({ ok: true, value: w.deployments }),
  stats: async () => ({ ok: true, value: w.stats }),
  smoke: async (_url, headers) => {
    w.calls.push(`smoke${Object.keys(headers).length > 0 ? ' override' : ''}`)
    return w.smokeOk ? { ok: true, value: { assets: 3 } } : { ok: false, error: 'boom' }
  },
  synthetic: async (_url, _headers, count) => {
    w.calls.push(`synthetic ${count}`)
  },
  sleep: async (ms) => {
    w.clock += ms
  },
  now: () => new Date(w.clock),
})

const canary: Strategy = { kind: 'canary', steps: [10, 50, 100], bakeMinutes: 10 }
const base = {
  workerName: 'qrcc-web',
  configPath: 'wrangler.production.json',
  url: 'https://qrcc.t/',
  commit: 'abc',
  runId: '1',
  minSamples: 200,
  maxExtensions: 2,
}

describe('rolloutWorker', () => {
  test('blue/green check at 0%, then canary steps, then 100% and a final smoke', async () => {
    const w = world()
    const outcome = await rolloutWorker(deps(w), { ...base, strategy: canary })
    expect(outcome).toEqual({ kind: 'released', versionId: 'new', previous: 'old' })
    expect(w.calls).toEqual([
      'upload',
      'deploy new@0% old@100%',
      'smoke override',
      'deploy new@10% old@90%',
      'deploy new@50% old@50%',
      'deploy new@100%',
      'smoke',
    ])
  })

  test('rolls back when the 0% smoke fails, before anyone sees the new version', async () => {
    const w = world({ smokeOk: false })
    const outcome = await rolloutWorker(deps(w), { ...base, strategy: canary })
    expect(outcome.kind).toBe('rolled-back')
    expect(w.calls).toEqual([
      'upload',
      'deploy new@0% old@100%',
      'smoke override',
      'deploy old@100%',
    ])
  })

  test('rolls back when the canary error rate is too high', async () => {
    const w = world({
      stats: new Map([
        ['new', { requests: 1000, errors: 80 }],
        ['old', { requests: 9000, errors: 9 }],
      ]),
    })
    const outcome = await rolloutWorker(deps(w), { ...base, strategy: canary })
    expect(outcome.kind).toBe('rolled-back')
    expect(w.calls.at(-1)).toBe('deploy old@100%')
    expect(w.calls).not.toContain('deploy new@50% old@50%')
  })

  test('tops up thin traffic with synthetic requests before judging', async () => {
    const w = world({
      stats: new Map([
        ['new', { requests: 150, errors: 0 }],
        ['old', { requests: 900, errors: 0 }],
      ]),
    })
    let topped = false
    const d = deps(w)
    const outcome = await rolloutWorker(
      {
        ...d,
        synthetic: async (url, headers, count) => {
          await d.synthetic(url, headers, count)
          topped = true
          w.stats.set('new', { requests: 150 + count, errors: 0 })
        },
      },
      { ...base, strategy: canary },
    )
    expect(topped).toBe(true)
    expect(w.calls).toContain('synthetic 50')
    expect(outcome.kind).toBe('released')
  })

  test('stops for a human when samples stay insufficient (internal worker cannot be probed)', async () => {
    const w = world({
      stats: new Map([
        ['new', { requests: 3, errors: 0 }],
        ['old', { requests: 30, errors: 0 }],
      ]),
    })
    const outcome = await rolloutWorker(deps(w), { ...base, url: undefined, strategy: canary })
    expect(outcome).toEqual({
      kind: 'needs-human',
      reason: expect.stringContaining('3/200'),
      versionId: 'new',
      stable: 'old',
      percentage: 10,
    })
    // 0% 検証の smoke は public でしか打てない
    expect(w.calls).not.toContain('smoke override')
    expect(w.calls.at(-1)).toBe('deploy new@10% old@90%')
  })

  test('first deployment of a worker goes straight to 100%', async () => {
    const w = world({ deployments: [] })
    const outcome = await rolloutWorker(deps(w), { ...base, strategy: canary })
    expect(outcome).toEqual({ kind: 'released', versionId: 'new', previous: undefined })
    expect(w.calls).toEqual(['upload', 'deploy new@100%', 'smoke'])
  })

  test('direct strategy deploys at once and rolls back on a failed smoke', async () => {
    const w = world({ smokeOk: false })
    const outcome = await rolloutWorker(deps(w), { ...base, strategy: { kind: 'direct' } })
    expect(outcome.kind).toBe('rolled-back')
    expect(w.calls).toEqual(['deploy-direct', 'smoke', 'deploy old@100%'])
  })

  test('resume continues from the current percentage without uploading', async () => {
    const w = world({
      deployments: [
        {
          id: 'd2',
          createdOn: '2',
          versions: [
            { versionId: 'new', percentage: 10 },
            { versionId: 'old', percentage: 90 },
          ],
        },
      ],
    })
    const outcome = await rolloutWorker(deps(w), {
      ...base,
      strategy: canary,
      resumeVersion: 'new',
    })
    expect(outcome.kind).toBe('released')
    expect(w.calls).toEqual(['deploy new@50% old@50%', 'deploy new@100%', 'smoke'])
  })
})
