import { expect, test } from 'bun:test'

import { STATE_PATHS, parseStatePath } from './paths.ts'

test('accepts only the allow-listed state paths', () => {
  for (const path of STATE_PATHS) expect(parseStatePath(path)).toEqual({ ok: true, value: path })
})

test.each([
  '/',
  '/states',
  '/states/',
  '/states/other',
  '/states/rimltools-production/x',
  '/states/../x',
])('rejects %p', (path) => {
  expect(parseStatePath(path).ok).toBe(false)
})
