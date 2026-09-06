import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
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
  sessionExpiresAt: new Date('2026-10-06T00:00:00Z'),
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
      updateDisplayName: record('updateDisplayName'),
    },
  }
}

describe('ログイン画面', () => {
  test('見出しと 2 つの選択肢が並ぶ（ux §4.5）', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    expect(screen.getByRole('heading', { level: 1, name: 'ログイン' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Google でログイン' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'ゲストのまま続ける' })).toBeDefined()
  })

  test('パスワードもパズルも課さない（AAA 3.3.9）', () => {
    const { actions } = okActions()
    const { container } = render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByLabelText(/パスワード/)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  test('ゲストのまま続けるとゲストのログインが走る', async () => {
    const { actions, calls } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    await userEvent.click(screen.getByRole('button', { name: 'ゲストのまま続ける' }))

    expect(calls).toEqual(['guest'])
  })

  test('ログインできたら知らせて、続きの画面へ渡す', async () => {
    const { actions } = okActions()
    const signedIn: string[] = []
    render(
      <SignInScreen
        actor={{ kind: 'visitor' }}
        actions={actions}
        onSignedIn={() => signedIn.push('done')}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'ゲストのまま続ける' }))

    await waitFor(() => expect(signedIn).toEqual(['done']))
  })

  test('Google を選ぶと Google のログインが走る', async () => {
    const { actions, calls } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    await userEvent.click(screen.getByRole('button', { name: 'Google でログイン' }))

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
          updateDisplayName: async () => ({ ok: true, value: undefined }),
        }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'ゲストのまま続ける' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('いまは処理できませんでした'),
    )
  })

  test('Google を設定していない環境ではボタンを出さず、理由を書く', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} isGoogleAvailable={false} />)

    // 「隠す」のではなく「出さない」（docs/accessibility.md §5）
    expect(screen.queryByRole('button', { name: 'Google でログイン' })).toBeNull()
    expect(screen.getByRole('button', { name: 'ゲストのまま続ける' })).toBeDefined()
    expect(document.body.textContent).toContain(
      'この環境では Google ログインを利用できません。ゲストのまま続けられます。',
    )
  })

  test('ゲストの制約を選ぶ前に伝える', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={{ kind: 'visitor' }} actions={actions} />)

    const guide = screen.getByRole('region', { name: 'ゲストのまま使うとき' })
    expect(guide.textContent).toContain('30 日')
    expect(guide.textContent).toContain('閲覧のみ')
    expect(guide.textContent).toContain('引き継')
  })

  test('ゲストには昇格で文書が引き継がれることを明記する', () => {
    const { actions } = okActions()
    render(<SignInScreen actor={guest} actions={actions} />)

    expect(screen.getByRole('button', { name: 'Google でログイン' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeDefined()
    // ゲストに「ゲストのまま続ける」を出しても意味がない
    expect(screen.queryByRole('button', { name: 'ゲストのまま続ける' })).toBeNull()
    expect(document.body.textContent).toContain('文書はそのまま引き継がれます')
  })

  test('ログイン済みの人にはログアウトだけを出す', () => {
    const { actions } = okActions()
    render(
      <SignInScreen
        actor={{ kind: 'user', userId: USER_ID, displayName: 'りむ' }}
        actions={actions}
      />,
    )

    expect(screen.queryByRole('button', { name: 'ゲストのまま続ける' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Google でログイン' })).toBeNull()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeDefined()
  })
})
