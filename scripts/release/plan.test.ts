import { describe, expect, test } from 'bun:test'

import { planRollout } from './plan.ts'
import { noter, qrcc } from './fixtures.ts'

describe('planRollout', () => {
  test('production canaries every worker, downstream (internal) first', () => {
    const plan = planRollout(qrcc, 'production')
    expect(plan.map((w) => w.worker.name)).toEqual(['qrcc-api', 'qrcc-web'])
    expect(plan[0]?.strategy).toEqual({ kind: 'canary', steps: [10, 50, 100], bakeMinutes: 10 })
  })

  test('staging goes straight to 100% after the blue/green check', () => {
    const plan = planRollout(qrcc, 'staging')
    expect(plan[1]?.strategy).toEqual({ kind: 'canary', steps: [100], bakeMinutes: 0 })
  })

  test('Durable Object workers are deployed directly (one version per object)', () => {
    const plan = planRollout(noter, 'production')
    expect(plan[0]?.worker.name).toBe('noter-sync')
    expect(plan[0]?.strategy).toEqual({ kind: 'direct' })
    expect(plan[1]?.strategy.kind).toBe('canary')
  })

  test('big-bang mode skips the canary steps but keeps the 0% check', () => {
    const tool = { ...qrcc, release: { ...qrcc.release, mode: 'big-bang' as const } }
    const plan = planRollout(tool, 'production')
    expect(plan[1]?.strategy).toEqual({ kind: 'canary', steps: [100], bakeMinutes: 0 })
  })
})
