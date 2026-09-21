import { describe, expect, test } from 'bun:test'
import { isGoogleConfigured, readEnvString, readLegacyOrigins, resolveBaseURL } from './from-env.ts'

describe('env の読み出し', () => {
  test('文字列でなければ空文字として扱う', () => {
    expect(readEnvString({ A: 'x' }, 'A')).toBe('x')
    expect(readEnvString({ A: 1 }, 'A')).toBe('')
    expect(readEnvString({}, 'A')).toBe('')
    expect(readEnvString(null, 'A')).toBe('')
    expect(readEnvString(undefined, 'A')).toBe('')
  })

  test('Google は 2 つそろって初めて「設定済み」', () => {
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toBe(true)
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: '' })).toBe(false)
    expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'b' })).toBe(false)
    expect(isGoogleConfigured({})).toBe(false)
  })
})

describe('baseURL の決め方', () => {
  test('本番は APP_ORIGIN に固定する（Host ヘッダを信用しない）', () => {
    expect(resolveBaseURL('https://noter.riml4i.com', 'https://evil.example')).toBe(
      'https://noter.riml4i.com',
    )
  })

  test('ローカルは実際に開いているオリジンを使う', () => {
    expect(resolveBaseURL('https://noter.riml4i.com', 'http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
    expect(resolveBaseURL('https://noter.riml4i.com', 'http://127.0.0.1:4210')).toBe(
      'http://127.0.0.1:4210',
    )
  })

  test('APP_ORIGIN が無ければリクエストのオリジンに従う', () => {
    expect(resolveBaseURL('', 'https://preview.example')).toBe('https://preview.example')
  })

  test('ドメイン移行中は、許可した旧オリジンで開かれたらそのオリジンを使う', () => {
    const legacy = ['https://noter.riml4i.com']
    expect(
      resolveBaseURL('https://noter.tools.riml4i.com', 'https://noter.riml4i.com', legacy),
    ).toBe('https://noter.riml4i.com')
    expect(
      resolveBaseURL('https://noter.tools.riml4i.com', 'https://noter.tools.riml4i.com', legacy),
    ).toBe('https://noter.tools.riml4i.com')
  })

  test('許可していないオリジンは旧オリジンの一覧があっても信用しない', () => {
    expect(
      resolveBaseURL('https://noter.tools.riml4i.com', 'https://evil.example', [
        'https://noter.riml4i.com',
      ]),
    ).toBe('https://noter.tools.riml4i.com')
  })
})

describe('旧オリジンの読み出し', () => {
  test('カンマ区切りの https オリジンだけを受け付ける', () => {
    expect(
      readLegacyOrigins({ APP_LEGACY_ORIGINS: 'https://noter.riml4i.com, https://a.example/' }),
    ).toEqual(['https://noter.riml4i.com', 'https://a.example'])
    expect(readLegacyOrigins({ APP_LEGACY_ORIGINS: 'http://x.example,not a url,' })).toEqual([])
    expect(readLegacyOrigins({})).toEqual([])
  })
})
