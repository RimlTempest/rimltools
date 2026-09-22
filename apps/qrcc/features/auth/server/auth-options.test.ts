import { describe, expect, test } from 'bun:test'
import { parseUserId } from '@qrcc/contract'
import { GUEST_DISPLAY_NAME, GUEST_SESSION_DAYS, buildAuthOptions } from './auth-options.ts'

/** 決定的な乱数。ID 発行の形だけを見たいので中身は固定でよい。 */
const fixedBytes = (byteLength: number) => new Uint8Array(byteLength).fill(7)

const options = buildAuthOptions({
  baseURL: 'https://qrcc.riml4i.com',
  secret: 'test-secret',
  google: { clientId: 'google-id', clientSecret: 'google-secret' },
  database: undefined,
  randomBytes: fixedBytes,
  onLinkAccount: async () => {},
})

describe('Better Auth の設定（ADR-0004 のセキュリティ上の決め事）', () => {
  // 共通化（@rimltools/auth）の前後で設定が変わっていないことの確認。
  // qrcc は basePath とゲストのメールドメインを書かず、Better Auth の既定のまま使う
  test('basePath とゲストのメールドメインは書かない（Better Auth の既定のまま）', () => {
    expect('basePath' in options).toBe(false)
    const anonymousPlugin = options.plugins[0]
    expect(anonymousPlugin?.id).toBe('anonymous')
    expect(anonymousPlugin?.options?.emailDomainName).toBeUndefined()
  })

  test('セッションの有効期限は 30 日', () => {
    expect(GUEST_SESSION_DAYS).toBe(30)
    expect(options.session?.expiresIn).toBe(30 * 24 * 60 * 60)
  })

  test('cookieCache は使わない', () => {
    // secondaryStorage を併用したときのフォールバック不具合を避ける
    expect(Object.keys(options.session)).not.toContain('cookieCache')
  })

  test('Cookie は HttpOnly / Secure / SameSite=Lax', () => {
    const attributes = options.advanced?.defaultCookieAttributes
    expect(attributes?.httpOnly).toBe(true)
    expect(attributes?.secure).toBe(true)
    expect(attributes?.sameSite).toBe('lax')
    expect(options.advanced?.useSecureCookies).toBe(true)
  })

  test('パスワード認証は使わない（AAA 3.3.9: 記憶させない）', () => {
    expect(options.emailAndPassword?.enabled).toBe(false)
  })

  test('Google の資格情報を渡す', () => {
    expect(options.socialProviders?.google?.clientId).toBe('google-id')
    expect(options.socialProviders?.google?.clientSecret).toBe('google-secret')
  })

  test('ゲストログイン（anonymous プラグイン）が入っている', () => {
    expect(options.plugins?.map((plugin) => plugin.id)).toContain('anonymous')
  })

  test('ユーザー ID は qrcc の UserId 形式で発行する', () => {
    const generateId = options.advanced?.database?.generateId
    expect(typeof generateId).toBe('function')
    if (typeof generateId === 'function') {
      const id = generateId({ model: 'user' })
      expect(typeof id).toBe('string')
      // qrcc-api に渡す actor は必ずこの形（ADR-0002）
      if (typeof id === 'string') expect(parseUserId(id).ok).toBe(true)
    }
  })

  test('ユーザー以外の ID も推測しにくい形にする', () => {
    const generateId = options.advanced?.database?.generateId
    if (typeof generateId === 'function') {
      const id = generateId({ model: 'session' })
      expect(id).toMatch(/^[0-9a-z]{24}$/)
      // 接頭辞で UserId と取り違えないようにする
      expect(parseUserId(id).ok).toBe(false)
    }
  })

  test('資格情報が無ければ Google の経路を出さない', () => {
    // ローカル開発では秘密情報なしでもゲストログインだけは動かせるようにする
    const withoutGoogle = buildAuthOptions({
      baseURL: 'http://localhost:4173',
      secret: 'test-secret',
      google: undefined,
      database: undefined,
      randomBytes: fixedBytes,
      onLinkAccount: async () => {},
    })
    expect(withoutGoogle.socialProviders.google).toBeUndefined()
  })

  test('ゲストには読める名前を付ける', () => {
    expect(GUEST_DISPLAY_NAME).toBe('ゲスト')
  })

  test('リダイレクト先は自分のオリジンだけを信頼する', () => {
    expect(options.baseURL).toBe('https://qrcc.riml4i.com')
    expect(options.trustedOrigins).toEqual(['https://qrcc.riml4i.com'])
  })
})
