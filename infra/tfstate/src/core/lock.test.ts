import { expect, test } from 'bun:test'

import { parseLockInfo } from './lock.ts'

test('reads the lock ID and keeps the original body', () => {
  const body = JSON.stringify({
    ID: '4d2c1b5e-8c9a-4f0e-b3a1-2f6d7e8c9a0b',
    Operation: 'OperationTypeApply',
    Who: 'runner@gha',
    Version: '1.12.6',
    Created: '2026-09-22T00:00:00Z',
    Path: '',
  })
  expect(parseLockInfo(body)).toEqual({
    ok: true,
    value: { id: '4d2c1b5e-8c9a-4f0e-b3a1-2f6d7e8c9a0b', info: body },
  })
})

test.each(['', '{}', '{"ID":""}', '{"ID":5}', 'x'])('rejects %p', (body) => {
  expect(parseLockInfo(body).ok).toBe(false)
})

test('rejects oversized lock info', () => {
  expect(parseLockInfo(JSON.stringify({ ID: 'a', Info: 'x'.repeat(20_000) })).ok).toBe(false)
})
