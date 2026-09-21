import { expect, test } from 'bun:test'

import { toPortalInput } from './build-lib.ts'

test('keeps only what the portal renders', () => {
  // 実際の Tool は項目が多い。余分なものは落とす
  const registry = {
    domain: 'tools.example.com',
    tools: [
      {
        name: 'qrcc',
        title: 'QR',
        description: 'd',
        host: 'qrcc.tools.example.com',
        listed: true,
        rust: true,
      },
      {
        name: 'portal',
        title: 'P',
        description: 'p',
        host: 'tools.example.com',
        listed: false,
        rust: false,
      },
    ],
  }
  expect(toPortalInput(registry)).toEqual({
    domain: 'tools.example.com',
    tools: [
      { name: 'qrcc', title: 'QR', description: 'd', host: 'qrcc.tools.example.com', listed: true },
      { name: 'portal', title: 'P', description: 'p', host: 'tools.example.com', listed: false },
    ],
  })
})
