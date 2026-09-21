import { expect, test } from 'bun:test'

import { loadTools } from './tools.ts'

// リポジトリの tools.json そのものが常に正しいこと
test('the committed tools.json is valid', async () => {
  const result = await loadTools()
  if (!result.ok) console.error(result.error)
  expect(result.ok).toBe(true)
})
