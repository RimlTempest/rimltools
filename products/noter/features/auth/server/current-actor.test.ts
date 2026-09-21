import { describe, expect, test } from 'bun:test'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import { makeCurrentActor, toActor } from './current-actor.ts'

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')
const EXPIRES = new Date('2026-10-06T00:00:00Z')

describe('いま誰が使っているかを取り出す', () => {
  test('セッションが無ければ visitor', () => {
    expect(toActor(null)).toEqual({ kind: 'visitor' })
    expect(toActor(undefined)).toEqual({ kind: 'visitor' })
  })

  test('匿名フラグが立っていればゲスト', () => {
    const actor = toActor({
      user: { id: USER_ID, name: 'ゲスト', isAnonymous: true },
      session: { expiresAt: EXPIRES },
    })
    expect(actor.kind).toBe('guest')
    if (actor.kind === 'guest') {
      expect(actor.userId).toBe(USER_ID)
      expect(actor.sessionExpiresAt).toEqual(EXPIRES)
    }
  })

  test('匿名でなければログイン済みユーザー', () => {
    expect(
      toActor({
        user: { id: USER_ID, name: 'りむ', isAnonymous: false },
        session: { expiresAt: EXPIRES },
      }),
    ).toEqual({ kind: 'user', userId: USER_ID, displayName: 'りむ' })
  })

  test('匿名フラグが無い（Google 由来）ならログイン済みユーザー', () => {
    expect(
      toActor({ user: { id: USER_ID, name: 'りむ' }, session: { expiresAt: EXPIRES } }).kind,
    ).toBe('user')
  })

  test('名前が空でも呼びかけられる表示名にする', () => {
    const guest = toActor({
      user: { id: USER_ID, name: '  ', isAnonymous: true },
      session: { expiresAt: EXPIRES },
    })
    if (guest.kind === 'guest') expect(guest.displayName).toBe('ゲスト')

    const user = toActor({ user: { id: USER_ID, name: '' }, session: { expiresAt: EXPIRES } })
    if (user.kind === 'user') expect(user.displayName).toBe('ログイン中')
  })

  test('ID の形が違えば visitor 扱いにする（安全側に倒す）', () => {
    expect(
      toActor({ user: { id: 'not-a-user-id', name: 'x' }, session: { expiresAt: EXPIRES } }),
    ).toEqual({ kind: 'visitor' })
  })

  test('リクエストの Cookie からセッションを引く', async () => {
    const seen: Headers[] = []
    const currentActor = makeCurrentActor(async (headers) => {
      seen.push(headers)
      return { user: { id: USER_ID, name: 'りむ' }, session: { expiresAt: EXPIRES } }
    })

    const request = new Request('https://noter.riml4i.com/')
    const actor = await currentActor(request)

    expect(actor.kind).toBe('user')
    // Cookie は fetch 実装からは読めない禁止ヘッダなので、渡ったヘッダそのもので確かめる
    expect(seen[0]).toBe(request.headers)
  })

  test('セッションの取得が失敗しても画面を落とさない', async () => {
    const currentActor = makeCurrentActor(async () => {
      throw new Error('D1 down')
    })
    expect(await currentActor(new Request('https://noter.riml4i.com/'))).toEqual({
      kind: 'visitor',
    })
  })
})
