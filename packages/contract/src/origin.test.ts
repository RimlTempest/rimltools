import { describe, expect, test } from 'bun:test'

import type { LocalDevOriginError } from './origin.ts'
import { parseLocalDevOrigin, resolvePublicOrigin, resolvePublicOriginFromEnv } from './origin.ts'

describe('parseLocalDevOrigin', () => {
  test.each([
    ['https://qrcc.rimltools.localhost', 'https://qrcc.rimltools.localhost'],
    ['https://noter.rimltools.localhost/', 'https://noter.rimltools.localhost'],
    ['https://fix-ui.qrcc.rimltools.localhost', 'https://fix-ui.qrcc.rimltools.localhost'],
    ['https://qrcc.rimltools.localhost:8443/path?q=1', 'https://qrcc.rimltools.localhost:8443'],
    ['https://localhost', 'https://localhost'],
    // Google ログインも通すための、自分のドメインの下のローカル専用 TLD（docs/local-dev.md）
    ['https://qrcc.rimltools.local.riml4i.com', 'https://qrcc.rimltools.local.riml4i.com'],
  ])('accepts %p as %p', (input, origin) => {
    expect(parseLocalDevOrigin(input)).toEqual({ ok: true, value: origin })
  })

  const rejected: [string, LocalDevOriginError][] = [
    ['', 'invalid'],
    ['not a url', 'invalid'],
    ['http://qrcc.rimltools.localhost', 'not-https'],
    ['https://qrcc.riml4i.com', 'not-localhost'],
    // `.localhost` で終わるように見せかけた別ドメイン
    ['https://qrcc.rimltools.localhost.evil.example', 'not-localhost'],
    ['https://evillocalhost', 'not-localhost'],
    // local.riml4i.com そのもの・本番のホスト・似せた別ドメインは不可
    ['https://local.riml4i.com', 'not-localhost'],
    ['https://qrcc.riml4i.com', 'not-localhost'],
    ['https://qrcc.local.riml4i.com.evil.example', 'not-localhost'],
    ['https://evil-local.riml4i.com', 'not-localhost'],
    ['https://user:pass@qrcc.rimltools.localhost', 'invalid'],
  ]
  test.each(rejected)('rejects %p (%s)', (input, reason) => {
    expect(parseLocalDevOrigin(input)).toEqual({ ok: false, error: reason })
  })
})

describe('resolvePublicOrigin', () => {
  test('DEV_PUBLIC_ORIGIN が正しい .localhost の https なら、それを使う', () => {
    expect(
      resolvePublicOrigin('https://qrcc.rimltools.localhost', 'http://qrcc.rimltools.localhost'),
    ).toBe('https://qrcc.rimltools.localhost')
  })

  test('無い、または不正なら、リクエストのオリジン（これまでの動き）', () => {
    expect(resolvePublicOrigin(undefined, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(resolvePublicOrigin('', 'https://qrcc.riml4i.com')).toBe('https://qrcc.riml4i.com')
    expect(resolvePublicOrigin('https://evil.example', 'https://qrcc.riml4i.com')).toBe(
      'https://qrcc.riml4i.com',
    )
  })
})

describe('resolvePublicOriginFromEnv', () => {
  test('env の DEV_PUBLIC_ORIGIN を読む', () => {
    expect(
      resolvePublicOriginFromEnv(
        { DEV_PUBLIC_ORIGIN: 'https://noter.rimltools.localhost' },
        'http://noter.rimltools.localhost',
      ),
    ).toBe('https://noter.rimltools.localhost')
  })

  test('env が無い・文字列でない場合はリクエストのオリジン', () => {
    expect(resolvePublicOriginFromEnv(undefined, 'https://a.example')).toBe('https://a.example')
    expect(resolvePublicOriginFromEnv({ DEV_PUBLIC_ORIGIN: 1 }, 'https://a.example')).toBe(
      'https://a.example',
    )
  })
})
