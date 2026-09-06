import { describe, expect, test } from 'bun:test'
import { isGoogleConfigured, readEnvString, resolveBaseURL } from './from-env.ts'

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
})
