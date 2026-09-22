import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { UserId } from '@noter/contract'
import { parseUserId } from '@noter/contract'
import type { Actor } from '../contract/actor.ts'
import { AuthStatus } from './auth-status.tsx'

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

describe('ヘッダーのログイン状態', () => {
  test('未ログインならログインへ誘導する', () => {
    render(<AuthStatus actor={{ kind: 'visitor' }} />)
    expect(screen.getByText('ログインしていません')).toBeDefined()
    expect(screen.getByRole('link', { name: 'ログイン' }).getAttribute('href')).toBe('/sign-in')
  })

  test('ゲストにはゲストであることを見せる', () => {
    render(<AuthStatus actor={guest} />)
    expect(screen.getByText('ゲスト')).toBeDefined()
    expect(screen.getByRole('link', { name: 'アカウント設定' }).getAttribute('href')).toBe(
      '/settings/account',
    )
  })

  test('ログイン済みなら表示名を出す', () => {
    render(<AuthStatus actor={{ kind: 'user', userId: USER_ID, displayName: 'りむ' }} />)
    expect(screen.getByText('りむ')).toBeDefined()
    expect(screen.getByRole('link', { name: 'アカウント設定' })).toBeDefined()
  })

  test('常駐表示なので live region にしない', () => {
    render(<AuthStatus actor={guest} />)
    // 画面遷移のたびに読み上げられてしまうため
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('リンクの描画方法を差し替えられる（ルータ非依存）', () => {
    render(
      <AuthStatus
        actor={guest}
        renderLink={({ to, label }) => <button type="button">{`${label}:${to}`}</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'アカウント設定:/settings/account' })).toBeDefined()
  })
})
