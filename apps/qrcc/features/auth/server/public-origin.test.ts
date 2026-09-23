import { describe, expect, test } from 'bun:test'

import { authBaseURL } from './from-env.ts'

describe('authBaseURL', () => {
  test('portless の dev（DEV_PUBLIC_ORIGIN）では、ブラウザが見ている https のオリジン', () => {
    expect(
      authBaseURL(
        { DEV_PUBLIC_ORIGIN: 'https://qrcc.rimltools.localhost' },
        'http://qrcc.rimltools.localhost',
      ),
    ).toBe('https://qrcc.rimltools.localhost')
  })

  test('それ以外はリクエストのオリジン（本番・portless を使わない dev）', () => {
    expect(authBaseURL({}, 'https://qrcc.riml4i.com')).toBe('https://qrcc.riml4i.com')
    expect(authBaseURL({}, 'http://localhost:5173')).toBe('http://localhost:5173')
  })

  test('.localhost の https 以外の DEV_PUBLIC_ORIGIN は信用しない', () => {
    expect(
      authBaseURL({ DEV_PUBLIC_ORIGIN: 'https://evil.example' }, 'https://qrcc.riml4i.com'),
    ).toBe('https://qrcc.riml4i.com')
  })
})
