import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { UserId } from '@qrcc/contract'
import { parseUserId } from '@qrcc/contract'
import { AuthStatus } from './auth-status.tsx'

afterEach(cleanup)

const asUserId = (value: string): UserId => {
  const parsed = parseUserId(value)
  if (!parsed.ok) throw new Error(`テストの UserId が不正: ${value}`)
  return parsed.value
}

const USER_ID = asUserId('usr_0123456789abcdefghjkmnpq')

describe('サインイン状態の表示', () => {
  test('未サインインならサインインへの導線を出す', () => {
    render(<AuthStatus actor={{ kind: 'visitor' }} />)
    const link = screen.getByRole('link', { name: 'サインインする' })
    expect(link.getAttribute('href')).toBe('/sign-in')
  })

  test('ゲストなら期限を添えて伝える', () => {
    render(
      <AuthStatus
        actor={{
          kind: 'guest',
          userId: USER_ID,
          displayName: 'ゲスト',
          sessionExpiresAt: new Date('2026-10-01T00:00:00Z'),
        }}
      />,
    )
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('ゲスト')
    expect(status.textContent).toContain('2026')
  })

  test('サインイン済みなら名前を出す', () => {
    render(<AuthStatus actor={{ kind: 'user', userId: USER_ID, displayName: 'りむ' }} />)
    expect(screen.getByRole('status').textContent).toContain('りむ')
  })

  test('リンクの描画方法を差し替えられる（ルータに依存しない）', () => {
    render(
      <AuthStatus
        actor={{ kind: 'visitor' }}
        renderLink={({ to, label }) => (
          <a href={to} data-testid="custom">
            {label}
          </a>
        )}
      />,
    )
    expect(screen.getAllByTestId('custom')).toHaveLength(1)
  })
})
