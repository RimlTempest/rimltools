import { describe, expect, test } from 'bun:test'

import { changedTools } from './changes.ts'
import { noter, portal, qrcc } from './fixtures.ts'

const tools = [qrcc, noter, portal]

describe('changedTools', () => {
  test('selects tools whose directory changed', () => {
    expect(changedTools(['products/qrcc/apps/web/src/x.ts'], tools)).toEqual(['qrcc'])
  })

  test('ignores docs-only changes inside a product', () => {
    expect(
      changedTools(['products/qrcc/docs/adr/1.md', 'products/noter/README.md'], tools),
    ).toEqual([])
  })

  test('shared root files release everything', () => {
    expect(changedTools(['bun.lock'], tools)).toEqual(['qrcc', 'noter', 'portal'])
    expect(changedTools(['packages/flags/src/index.ts'], tools)).toEqual([
      'qrcc',
      'noter',
      'portal',
    ])
  })

  test('unrelated root files release nothing', () => {
    expect(changedTools(['docs/platform.md', '.github/workflows/ci.yml'], tools)).toEqual([])
  })

  test('the portal is released when its own files change', () => {
    expect(changedTools(['products/portal/src/index.html'], tools)).toEqual(['portal'])
  })
})
