import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { GlobalNav } from './shell-kit.tsx'
import { NAV_ITEMS } from './nav-items.ts'

afterEach(cleanup)

describe('GlobalNav', () => {
  test('nav ランドマークとして名前を持つ', () => {
    render(<GlobalNav currentPath="/" />)
    expect(screen.getByRole('navigation', { name: 'グローバル' })).toBeDefined()
  })

  test('リストとして並ぶ（項目数が支援技術に伝わる）', () => {
    render(<GlobalNav currentPath="/" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(NAV_ITEMS.length)
  })

  test('現在地に aria-current="page" が付く（AAA 2.4.8）', () => {
    render(<GlobalNav currentPath="/settings/account" />)
    const current = screen.getByRole('link', { name: 'アカウント設定' })
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  test('現在地以外には aria-current を付けない', () => {
    render(<GlobalNav currentPath="/settings/account" />)
    const other = screen.getByRole('link', { name: '文書一覧' })
    expect(other.getAttribute('aria-current')).toBeNull()
  })

  test('リンク文言は単体で行き先が分かる（AAA 2.4.9）', () => {
    render(<GlobalNav currentPath="/" />)
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toBeDefined()
      expect(item.label).not.toMatch(/^(こちら|詳細|もっと見る)$/)
    }
  })

  test('リンクの描画方法を差し替えられる（ルータに依存しない）', () => {
    render(
      <GlobalNav
        currentPath="/"
        renderLink={({ to, label }) => (
          <a href={to} data-testid="custom">
            {label}
          </a>
        )}
      />,
    )
    expect(screen.getAllByTestId('custom')).toHaveLength(NAV_ITEMS.length)
  })
})
