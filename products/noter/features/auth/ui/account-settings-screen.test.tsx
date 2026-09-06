import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserId } from '@noter/contract'
import { MAX_DISPLAY_NAME, parseUserId } from '@noter/contract'
import type { ThemePreference, ThemeStore } from '@noter/ui'
import type { Actor } from '../contract/actor.ts'
import type { AuthActions } from './auth-actions.ts'
import { AccountSettingsScreen } from './account-settings-screen.tsx'

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
const user: Actor = { kind: 'user', userId: USER_ID, displayName: 'りむ' }

const fakeStore = () => {
  let current: ThemePreference = 'system'
  const written: ThemePreference[] = []
  const store: ThemeStore = {
    read: () => current,
    write: (preference) => {
      current = preference
      written.push(preference)
    },
  }
  return { store, written }
}

const okActions = (): { actions: AuthActions; calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    actions: {
      signInAsGuest: async () => {
        calls.push('guest')
        return { ok: true, value: undefined }
      },
      signInWithGoogle: async () => {
        calls.push('google')
        return { ok: true, value: undefined }
      },
      signOut: async () => {
        calls.push('signOut')
        return { ok: true, value: undefined }
      },
      updateDisplayName: async (name) => {
        calls.push(`name:${name}`)
        return { ok: true, value: undefined }
      },
    },
  }
}

const renderScreen = (actor: Actor, overrides: { isGoogleAvailable?: boolean } = {}) => {
  const { store } = fakeStore()
  const { actions, calls } = okActions()
  render(
    <AccountSettingsScreen
      actor={actor}
      actions={actions}
      themeStore={store}
      {...(overrides.isGoogleAvailable === undefined
        ? {}
        : { isGoogleAvailable: overrides.isGoogleAvailable })}
    />,
  )
  return { calls }
}

describe('アカウント設定', () => {
  test('パンくずで現在位置が分かる（AAA 2.4.8）', () => {
    renderScreen(guest)
    const breadcrumbs = screen.getByRole('navigation', { name: 'パンくず' })
    expect(breadcrumbs.textContent).toContain('文書一覧')
    expect(breadcrumbs.textContent).toContain('アカウント設定')
  })

  test('見出しは h1 が 1 つ', () => {
    renderScreen(guest)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('表示名は可視ラベル付きの入力で、上限が入る', () => {
    renderScreen(user)
    const input = screen.getByLabelText('表示名')
    expect(input.getAttribute('maxlength')).toBe(String(MAX_DISPLAY_NAME))
    expect(MAX_DISPLAY_NAME).toBe(32)
  })

  test('表示名を変えて送ると保存され、結果を読み上げる', async () => {
    const { calls } = renderScreen(user)

    const input = screen.getByLabelText('表示名')
    await userEvent.clear(input)
    await userEvent.type(input, 'りむ2')
    await userEvent.click(screen.getByRole('button', { name: '表示名を変更' }))

    expect(calls).toEqual(['name:りむ2'])
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('表示名を変更しました'),
    )
  })

  test('ゲストには期限と引き継ぎを伝え、Google の導線を出す', () => {
    renderScreen(guest)
    expect(screen.getByRole('button', { name: 'Google でログイン' })).toBeDefined()
    expect(document.body.textContent).toContain('文書はそのまま引き継がれます')
    expect(document.body.textContent).toContain('ゲストとして利用中')
  })

  test('Google 未設定の環境では連携ボタンを出さず理由を書く', () => {
    renderScreen(guest, { isGoogleAvailable: false })
    expect(screen.queryByRole('button', { name: 'Google でログイン' })).toBeNull()
    expect(document.body.textContent).toContain(
      'この環境では Google ログインを利用できません。ゲストのまま続けられます。',
    )
  })

  test('ログイン済みには連携状態を出し、連携ボタンは出さない', () => {
    renderScreen(user)
    expect(document.body.textContent).toContain('Google アカウントと連携しています')
    expect(screen.queryByRole('button', { name: 'Google でログイン' })).toBeNull()
  })

  test('ログアウトできる', async () => {
    const { calls } = renderScreen(user)
    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(calls).toEqual(['signOut'])
  })

  test('未ログインにはログアウトも表示名の変更も出さない', () => {
    renderScreen({ kind: 'visitor' })
    expect(screen.queryByLabelText('表示名')).toBeNull()
    expect(screen.queryByRole('button', { name: 'ログアウト' })).toBeNull()
    expect(document.body.textContent).toContain('ログインしていません')
  })

  test('アカウント削除は置かない（v1）', () => {
    renderScreen(user)
    expect(screen.queryByRole('button', { name: /削除/ })).toBeNull()
  })

  test('外観の設定に見出しと説明が付く（AAA 3.3.5）', async () => {
    const { store, written } = fakeStore()
    const { actions } = okActions()
    render(<AccountSettingsScreen actor={user} actions={actions} themeStore={store} />)

    expect(screen.getByRole('heading', { level: 2, name: '外観' })).toBeDefined()
    expect(screen.getByRole('group', { name: 'テーマ' })).toBeDefined()

    await userEvent.click(screen.getByRole('radio', { name: 'ダーク' }))
    expect(written).toEqual(['dark'])
  })
})
