import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeScreen } from './home-screen.tsx'

afterEach(cleanup)

describe('HomeScreen', () => {
  test('h1 が 1 つだけある', () => {
    render(<HomeScreen />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('文書一覧')
  })

  /** 空の画面に何も書かないと、壊れているのか空なのか区別が付かない。 */
  test('文書が無いことを文言で伝える', () => {
    render(<HomeScreen />)
    expect(screen.getByText('まだ文書がありません。')).toBeDefined()
  })

  test('新しい文書を作るリンクがある', () => {
    render(<HomeScreen />)
    expect(screen.getByRole('link', { name: '新しい文書を作る' }).getAttribute('href')).toBe('/new')
  })

  test('リンク文言だけで行き先が分かる（AAA 2.4.9）', () => {
    render(<HomeScreen />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(/^(こちら|詳細|もっと見る|ここ)$/)
      expect((link.textContent ?? '').length).toBeGreaterThan(3)
    }
  })

  test('リンクの描画方法を差し替えられる（ルータに依存しない）', () => {
    render(
      <HomeScreen
        renderLink={({ to, label }) => (
          <a href={to} data-testid="custom">
            {label}
          </a>
        )}
      />,
    )
    expect(screen.getByTestId('custom').textContent).toBe('新しい文書を作る')
  })
})
