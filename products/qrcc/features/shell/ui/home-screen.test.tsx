import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeScreen } from './home-screen.tsx'

afterEach(cleanup)

describe('HomeScreen', () => {
  test('h1 が 1 つだけある', () => {
    render(<HomeScreen />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('見出しレベルを飛ばさない（AAA 2.4.10）', () => {
    render(<HomeScreen />)
    const levels = screen.getAllByRole('heading').map((heading) => Number(heading.tagName.slice(1)))
    for (const [index, level] of levels.entries()) {
      const previous = levels[index - 1]
      if (previous !== undefined) expect(level - previous).toBeLessThanOrEqual(1)
    }
  })

  test('できることを箇条書きで示す（use-list）', () => {
    render(<HomeScreen />)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)
  })

  test('リンク文言だけで行き先が分かる（AAA 2.4.9）', () => {
    render(<HomeScreen />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(/^(こちら|詳細|もっと見る|ここ)$/)
      expect((link.textContent ?? '').length).toBeGreaterThan(3)
    }
  })
})
