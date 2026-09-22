import { describe, expect, test } from 'bun:test'

import { isTransientInstallFailure, planRetries } from './install-retry.ts'

describe('isTransientInstallFailure', () => {
  test.each([
    'error: ECONNRESET while contacting the security scanner',
    'socket hang up',
    'error: ETIMEDOUT https://registry.npmjs.org/react',
    'fetch failed',
    'error: GET https://registry.npmjs.org/oxlint - 503',
    'Socket: request failed with status 502',
    'error: EAI_AGAIN registry.npmjs.org',
    'Network error: connection refused',
  ])('retries on %p', (output) => {
    expect(isTransientInstallFailure(output)).toBe(true)
  })

  test.each([
    'error: lockfile had changes, but lockfile is frozen',
    'error: package "foo" not found',
    'Security scanner: fatal advisory for evil-pkg@1.0.0',
    'error: minimumReleaseAge: react@20.0.0 was published 2 days ago',
    '',
  ])('does not retry on %p', (output) => {
    expect(isTransientInstallFailure(output)).toBe(false)
  })
})

describe('planRetries', () => {
  test('backs off 10s then 30s for three attempts', () => {
    expect(planRetries(3)).toEqual([10_000, 30_000])
  })

  test('a single attempt never waits', () => {
    expect(planRetries(1)).toEqual([])
  })
})
