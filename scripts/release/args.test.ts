import { describe, expect, test } from 'bun:test'

import { parseArgs } from './args.ts'

describe('parseArgs', () => {
  test('reads the step and options', () => {
    const result = parseArgs(['rollout', '--tool', 'qrcc', '--dry-run'])
    expect(result).toEqual({
      ok: true,
      value: {
        step: 'rollout',
        tool: 'qrcc',
        dryRun: true,
        version: undefined,
        worker: undefined,
        alias: undefined,
      },
    })
  })

  test('requires --tool for tool steps', () => {
    expect(parseArgs(['rollout']).ok).toBe(false)
  })

  test('rejects unknown steps and flags', () => {
    expect(parseArgs(['deploy', '--tool', 'qrcc']).ok).toBe(false)
    expect(parseArgs(['rollout', '--tool', 'qrcc', '--force']).ok).toBe(false)
  })

  test('changed and check-migrations need no tool', () => {
    expect(parseArgs(['changed']).ok).toBe(true)
    expect(parseArgs(['check-migrations']).ok).toBe(true)
  })
})
