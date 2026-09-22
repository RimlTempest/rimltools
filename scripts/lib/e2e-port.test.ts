import { describe, expect, test } from 'bun:test'

import { resolveE2ePort } from './e2e-port.ts'

const allocateNever = (): number => {
  throw new Error('must not allocate when the port is already set')
}

describe('resolveE2ePort', () => {
  test('uses the port already in the environment (set by the runner for its workers)', () => {
    const env: Record<string, string | undefined> = { QRCC_E2E_PORT: '4555' }
    expect(resolveE2ePort(env, 'QRCC_E2E_PORT', allocateNever)).toBe(4555)
  })

  test('asks the OS for a free port once and records it for the workers', () => {
    const env: Record<string, string | undefined> = {}
    let calls = 0
    const allocate = () => {
      calls += 1
      return 51234
    }
    expect(resolveE2ePort(env, 'NOTER_E2E_PORT', allocate)).toBe(51234)
    expect(env['NOTER_E2E_PORT']).toBe('51234')
    expect(resolveE2ePort(env, 'NOTER_E2E_PORT', allocate)).toBe(51234)
    expect(calls).toBe(1)
  })

  test('ignores a malformed value and allocates instead', () => {
    const env: Record<string, string | undefined> = { QRCC_E2E_PORT: 'abc' }
    expect(resolveE2ePort(env, 'QRCC_E2E_PORT', () => 40000)).toBe(40000)
  })
})
