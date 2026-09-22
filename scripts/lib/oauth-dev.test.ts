import { describe, expect, test } from 'bun:test'

import { planOAuthDev } from './oauth-dev.ts'

const tool = { name: 'qrcc', path: 'apps/qrcc', localOAuthPort: 5173 }

describe('planOAuthDev', () => {
  test('portless を外し、固定ポートで起動する計画を返す', () => {
    expect(planOAuthDev(tool)).toEqual({
      ok: true,
      value: {
        cwd: 'apps/qrcc',
        env: { PORTLESS: '0', PORT: '5173', HOST: 'localhost' },
        url: 'http://localhost:5173',
        redirectUri: 'http://localhost:5173/api/auth/callback/google',
      },
    })
  })

  test('localOAuthPort の無いツールは失敗にする', () => {
    const result = planOAuthDev({ ...tool, localOAuthPort: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('qrcc has no localOAuthPort')
  })
})
