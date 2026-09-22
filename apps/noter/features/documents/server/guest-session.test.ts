import { describe, expect, test } from 'bun:test'
import { userId } from '../core/tests/fixtures.ts'
import { makeIssueGuest } from './guest-session.ts'

const ORIGIN = 'https://noter.example'

/**
 * `Set-Cookie` は本物のヘッダに載せない。テスト環境（happy-dom）の `Headers` は
 * `set-cookie` を落としてしまうので、取り出し方を `readSetCookies` で差し替える。
 */
const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const withCookies = (cookies: readonly string[]) => () => cookies

describe('makeIssueGuest', () => {
  test('自分のオリジンへ POST し、Set-Cookie と UserId を返す', async () => {
    const seen: Request[] = []
    const issue = makeIssueGuest({
      origin: ORIGIN,
      readSetCookies: withCookies(['session=abc; Path=/']),
      handler: async (request) => {
        seen.push(request)
        return respond({ user: { id: userId('1'), name: 'ゲスト' } })
      },
    })

    const issued = await issue()
    expect(issued).toEqual({
      ok: true,
      value: { userId: userId('1'), displayName: 'ゲスト', setCookies: ['session=abc; Path=/'] },
    })

    const request = seen[0]
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${ORIGIN}/api/auth/sign-in/anonymous`)
    // Origin が無いと Better Auth に CSRF として弾かれる
    expect(request?.headers.get('origin')).toBe(ORIGIN)
  })

  test('Set-Cookie が複数でもすべて返す', async () => {
    const issue = makeIssueGuest({
      origin: ORIGIN,
      readSetCookies: withCookies(['a=1', 'b=2']),
      handler: async () => respond({ user: { id: userId('1'), name: 'ゲスト' } }),
    })
    const issued = await issue()
    expect(issued.ok && issued.value.setCookies).toEqual(['a=1', 'b=2'])
  })

  test('認証が落ちていたら storage_unavailable', async () => {
    const issue = makeIssueGuest({
      origin: ORIGIN,
      handler: async () => new Response('nope', { status: 503 }),
    })
    const issued = await issue()
    expect(issued.ok).toBe(false)
    expect(issued.ok ? '' : issued.error.kind).toBe('storage_unavailable')
  })

  test('Set-Cookie が無ければ失敗にする（サインインできていない）', async () => {
    const issue = makeIssueGuest({
      origin: ORIGIN,
      readSetCookies: withCookies([]),
      handler: async () => respond({ user: { id: userId('1'), name: 'ゲスト' } }),
    })
    expect((await issue()).ok).toBe(false)
  })

  test('UserId として読めない ID は受け付けない', async () => {
    const issue = makeIssueGuest({
      origin: ORIGIN,
      readSetCookies: withCookies(['session=abc']),
      handler: async () => respond({ user: { id: 'not-a-user-id', name: 'ゲスト' } }),
    })
    expect((await issue()).ok).toBe(false)
  })
})
