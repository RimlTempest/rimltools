import { describe, expect, test } from 'bun:test'

import { normalizePath } from './route.ts'

describe('normalizePath', () => {
  test.each([
    ['/', '/'],
    ['/generate', '/generate'],
    ['/documents/doc_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', '/documents/:id'],
    ['/codes/3f2b7c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f/print', '/codes/:id/print'],
    ['/ws/doc_abc123def456', '/ws/:id'],
    ['/assets/index-a1b2c3d4.js', '/assets/:asset'],
    ['/api/auth/callback/google', '/api/auth/callback/google'],
  ])('%s → %s', (path, expected) => {
    expect(normalizePath(path)).toBe(expected)
  })
})
