import { describe, expect, test } from 'bun:test'
import { parseUserId } from '@noter/contract'
import {
  GUEST_DISPLAY_NAME,
  GUEST_EMAIL_DOMAIN,
  GUEST_SESSION_DAYS,
  buildAuthOptions,
} from './auth-options.ts'

/** 決定的な乱数。ID 発行の形だけを見たいので中身は固定でよい。 */
const fixedBytes = (byteLength: number) => new Uint8Array(byteLength).fill(7)

const noopLinkAccount = async () => {}

const options = buildAuthOptions({
  baseURL: 'https://noter.riml4i.com',
  secret: 'test-secret',
  google: { clientId: 'google-id', clientSecret: 'google-secret' },
  database: undefined,
  randomBytes: fixedBytes,
  onLinkAccount: async () => {},
})

describe('Better Auth の設定（ADR-0010 のセキュリティ上の決め事）', () => {
  test('セッションの有効期限は 30 日', () => {
    expect(GUEST_SESSION_DAYS).toBe(30)
    expect(options.session.expiresIn).toBe(30 * 24 * 60 * 60)
  })

  test('セッション設定は期限だけ（Cookie にセッションを載せない / ADR-0010）', () => {
    expect(Object.keys(options.session).toSorted()).toEqual(['expiresIn', 'updateAge'])
  })

  test('Cookie は HttpOnly / Secure / SameSite=Lax', () => {
    const attributes = options.advanced.defaultCookieAttributes
    expect(attributes.httpOnly).toBe(true)
    expect(attributes.secure).toBe(true)
    expect(attributes.sameSite).toBe('lax')
    expect(options.advanced.useSecureCookies).toBe(true)
  })

  test('パスワード認証は使わない（AAA 3.3.9: 記憶させない）', () => {
    expect(options.emailAndPassword.enabled).toBe(false)
  })

  test('エンドポイントは /api/auth の下に置く', () => {
    expect(options.basePath).toBe('/api/auth')
  })

  test('Google の資格情報を渡す', () => {
    expect(options.socialProviders.google?.clientId).toBe('google-id')
    expect(options.socialProviders.google?.clientSecret).toBe('google-secret')
  })

  test('資格情報が無ければ Google の経路を出さない', () => {
    // ローカル開発では秘密情報なしでもゲストログインだけは動かせるようにする
    const withoutGoogle = buildAuthOptions({
      baseURL: 'http://localhost:5173',
      secret: 'test-secret',
      google: undefined,
      database: undefined,
      randomBytes: fixedBytes,
      onLinkAccount: async () => {},
    })
    expect(withoutGoogle.socialProviders.google).toBeUndefined()
  })

  test('ゲストログイン（anonymous プラグイン）が入っている', () => {
    expect(options.plugins.map((plugin) => plugin.id)).toContain('anonymous')
  })

  test('ゲストには読める名前と外へ出ないメールドメインを与える', () => {
    expect(GUEST_DISPLAY_NAME).toBe('ゲスト')
    expect(GUEST_EMAIL_DOMAIN).toBe('guest.noter.invalid')
  })

  // 共通化（@rimltools/auth）の前後で、ゲストのメールドメインが実際にプラグインへ渡っていること
  test('ゲストのメールドメインは anonymous プラグインに渡る', () => {
    const anonymousPlugin = options.plugins[0]
    expect(anonymousPlugin?.id).toBe('anonymous')
    expect(anonymousPlugin?.options?.emailDomainName).toBe(GUEST_EMAIL_DOMAIN)
  })

  test('ユーザー ID は noter の UserId 形式で発行する', () => {
    const generateId = options.advanced.database.generateId
    const id = generateId({ model: 'user' })
    expect(typeof id).toBe('string')
    // noter-sync に渡す actor は必ずこの形（ADR-0002）
    expect(parseUserId(id).ok).toBe(true)
  })

  test('ユーザー以外の ID も推測しにくい形にする', () => {
    const id = options.advanced.database.generateId({ model: 'session' })
    expect(id).toMatch(/^[0-9a-z]{24}$/)
    // 接頭辞で UserId と取り違えないようにする
    expect(parseUserId(id).ok).toBe(false)
  })

  test('リダイレクト先は自分のオリジンだけを信頼する', () => {
    expect(options.baseURL).toBe('https://noter.riml4i.com')
    expect(options.trustedOrigins).toEqual(['https://noter.riml4i.com'])
  })

  test('ゲストが Google でログインしたときのフックを anonymous に渡す', () => {
    const withHook = buildAuthOptions({
      baseURL: 'https://noter.riml4i.com',
      secret: 'test-secret',
      google: undefined,
      database: undefined,
      randomBytes: fixedBytes,
      onLinkAccount: noopLinkAccount,
    })
    // 渡した関数がそのまま保持されていること。移譲そのものは link-account.test.ts が見る
    expect(withHook.plugins[0]?.options?.onLinkAccount).toBe(noopLinkAccount)
  })
})
