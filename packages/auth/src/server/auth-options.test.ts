import { describe, expect, test } from 'bun:test'
import { anonymous as realAnonymous } from 'better-auth/plugins'

import { buildAuthOptions, GUEST_DISPLAY_NAME, GUEST_SESSION_DAYS } from './auth-options.ts'
import type { AnonymousPlugin, AnonymousSettings, SharedAuthOptionsDeps } from './auth-options.ts'

const recorded: AnonymousSettings[] = []
// 本物のプラグインを包み、渡された設定だけを記録する
const anonymous: AnonymousPlugin<ReturnType<typeof realAnonymous>> = (settings) => {
  recorded.push(settings)
  return realAnonymous(settings)
}

const base: SharedAuthOptionsDeps<undefined, ReturnType<typeof realAnonymous>> = {
  appName: 'demo',
  baseURL: 'https://demo.example',
  secret: 's3cret',
  google: undefined,
  database: undefined,
  randomBytes: (n) => new Uint8Array(n),
  onLinkAccount: async () => {},
  anonymous,
}

describe('buildAuthOptions', () => {
  test('trusts only its own origin and never enables passwords', () => {
    const options = buildAuthOptions(base)
    expect(options.appName).toBe('demo')
    expect(options.trustedOrigins).toEqual(['https://demo.example'])
    expect(options.emailAndPassword).toEqual({ enabled: false })
  })

  test('pins the cookie attributes and does not cache sessions in cookies', () => {
    const options = buildAuthOptions(base)
    expect(options.advanced.useSecureCookies).toBe(true)
    expect(options.advanced.defaultCookieAttributes).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
    // cookieCache を書かないこと自体が設定。session のキーはこの 2 つだけ
    expect(Object.keys(options.session).toSorted()).toEqual(['expiresIn', 'updateAge'])
    expect(options.session.expiresIn).toBe(GUEST_SESSION_DAYS * 24 * 60 * 60)
  })

  test('offers Google only when credentials are set, with the account chooser', () => {
    expect(buildAuthOptions(base).socialProviders).toEqual({})
    const withGoogle = buildAuthOptions({
      ...base,
      google: { clientId: 'id', clientSecret: 'sec' },
    })
    expect(withGoogle.socialProviders).toEqual({
      google: { clientId: 'id', clientSecret: 'sec', prompt: 'select_account' },
    })
  })

  test('omits basePath and the guest email domain unless the product sets them', () => {
    recorded.length = 0
    const options = buildAuthOptions(base)
    expect('basePath' in options).toBe(false)
    expect(recorded[0]).not.toHaveProperty('emailDomainName')
    const generateName = recorded[0]?.generateName
    expect(
      generateName === undefined ? undefined : Reflect.apply(generateName, undefined, [{}]),
    ).toBe(GUEST_DISPLAY_NAME)
  })

  test('passes basePath and the guest email domain through when set', () => {
    recorded.length = 0
    const options = buildAuthOptions({
      ...base,
      basePath: '/api/auth',
      guestEmailDomain: 'guest.demo.invalid',
    })
    expect(options.basePath).toBe('/api/auth')
    expect(recorded[0]?.emailDomainName).toBe('guest.demo.invalid')
  })

  test('issues UserIds for users and base32 ids for everything else', () => {
    const generateId = buildAuthOptions(base).advanced.database.generateId
    expect(generateId({ model: 'user' })).toMatch(/^usr_[0-9a-z]{24}$/)
    expect(generateId({ model: 'session' })).toMatch(/^[0-9a-z]{24}$/)
  })
})
