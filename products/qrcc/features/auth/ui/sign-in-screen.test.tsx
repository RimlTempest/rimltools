import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import type { Actor } from '../contract/actor.ts'
import type { AuthActions } from './auth-actions.ts'
import { SignInScreen } from './sign-in-screen.tsx'

afterEach(cleanup)

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')

const guest: Actor = {
  kind: 'guest',
  userId: USER_ID,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
}

const okActions = (): { actions: AuthActions; calls: string[] } => {
  const calls: string[] = []
  const record = (name: string) => async () => {
    calls.push(name)
    return { ok: true as const, value: undefined }
  }
  return {
    calls,
    actions: {
      signInAsGuest: record('guest'),
      signInWithGoogle: record('google'),
      signOut: record('signOut'),
    },
  }
}

describe('サインイン画面', () => {
  test('見出しと 2 つの選択肢が並ぶ', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Google で続ける' })).toBeDefined()
    expect(screen.getByRole('button', { name: '登録せずに使う（ゲスト）' })).toBeDefined()
  })

  test('パスワードもパズルも課さない（AAA 3.3.9）', () => {
    const { actions } = okActions()
    const { container } = render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/パスワード/)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  test('ゲストを選ぶとゲストのサインインが走る', async () => {
    const { actions, calls } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    await userEvent.click(screen.getByRole('button', { name: '登録せずに使う（ゲスト）' }))

    expect(calls).toEqual(['guest'])
  })

  test('サインインできたら知らせて、続きの画面へ渡す', async () => {
    const { actions } = okActions()
    const signedIn: string[] = []
    render(
      <SignInScreen
        actor={{ kind: 'visitor' }}
        actions={actions}
        onSignedIn={() => signedIn.push('done')}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '登録せずに使う（ゲスト）' }))

    await waitFor(() => expect(signedIn).toEqual(['done']))
  })

  test('Google を選ぶと Google のサインインが走る', async () => {
    const { actions, calls } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    await userEvent.click(screen.getByRole('button', { name: 'Google で続ける' }))

    expect(calls).toEqual(['google'])
  })

  test('失敗したら理由を読み上げる', async () => {
    render(
      <SignInScreen
        actor={{ kind: 'visitor' }}
        actions={{
          signInAsGuest: async () => ({
            ok: false,
            error: { kind: 'unavailable', detail: 'offline' },
          }),
          signInWithGoogle: async () => ({ ok: true, value: undefined }),
          signOut: async () => ({ ok: true, value: undefined }),
        }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '登録せずに使う（ゲスト）' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('サインインできませんでした'),
    )
  })

  test('ゲストの制約を先に伝える', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    const guide = screen.getByRole('region', { name: 'ゲストで使うときの注意' })
    expect(guide.textContent).toContain('30 日')
    expect(guide.textContent).toContain('編集できる共有リンク')
    expect(guide.textContent).toContain('期限なしの共有リンク')
    // あとから引き継げることを、選ぶ前に伝える
    expect(guide.textContent).toContain('引き継')
  })

  test('Google を設定していない環境ではボタンを出さず、理由を書く', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} isGoogleAvailable={false} />)

    expect(screen.queryByRole('button', { name: 'Google で続ける' })).toBeNull()
    expect(screen.getByRole('button', { name: '登録せずに使う（ゲスト）' })).toBeDefined()
    expect(document.body.textContent).toContain('Google でのサインインはこの環境では使えません')
  })

  test('ゲストで使っている人には引き継ぎとサインアウトを出す', async () => {
    const { actions, calls } = okActions()
    render(<SignInScreen actor={guest} actions={actions} />)

    expect(screen.getByRole('button', { name: 'Google で続けてデータを引き継ぐ' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))

    expect(calls).toEqual(['signOut'])
  })

  test('サインイン済みの人にゲストの選択肢を出さない', () => {
    const { actions } = okActions()
    render(
      <SignInScreen
        actor={{ kind: 'user', userId: USER_ID, displayName: 'りむ' }}
        actions={actions}
      />,
    )

    expect(screen.queryByRole('button', { name: '登録せずに使う（ゲスト）' })).toBeNull()
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeDefined()
  })
})

/**
 * 区画が窓（Mado）として出ているか。
 *
 * 窓は「帯（header）＋ 本体」の 2 段で、見出しは帯の中に入る（riml-ds ADR-0014）。
 * section に見出しと中身を並べただけの板では、区画の直下に中身が出てしまい通らない。
 */
const expectWindow = (name: string) => {
  const region = screen.getByRole('region', { name })
  const heading = within(region).getByRole('heading', { name })
  const bar = region.firstElementChild
  expect(bar?.tagName).toBe('HEADER')
  expect(bar?.className).toBe('rd-window-bar')
  expect(bar?.contains(heading)).toBe(true)
  expect(region.children.length).toBe(2)
  expect(bar?.nextElementSibling?.className).toBe('rd-window-body')
}

describe('サインイン画面の区画', () => {
  test('ゲストの注意書きは窓として出る', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)
    expectWindow('ゲストで使うときの注意')
  })
})
