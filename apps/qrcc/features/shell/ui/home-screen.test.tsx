import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeScreen } from './home-screen.tsx'

afterEach(cleanup)

/** 実物の代わりに、置かれた場所が分かるだけの中身を差し込む。 */
const slots = {
  generate: (
    <section aria-label="生成のダミー">
      <h2>コードを作る</h2>
    </section>
  ),
  scan: (
    <section aria-label="読み取りのダミー">
      <h2>コードを読み取る</h2>
    </section>
  ),
}

describe('HomeScreen', () => {
  test('h1 が 1 つだけある', () => {
    render(<HomeScreen {...slots} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('作る画面と読み取る画面を、この順で並べる', () => {
    render(<HomeScreen {...slots} />)
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual(['コードを作る', 'コードを読み取る'])
  })

  test('見出しレベルを飛ばさない（AAA 2.4.10）', () => {
    render(<HomeScreen {...slots} />)
    const levels = screen.getAllByRole('heading').map((heading) => Number(heading.tagName.slice(1)))
    for (const [index, level] of levels.entries()) {
      const previous = levels[index - 1]
      if (previous !== undefined) expect(level - previous).toBeLessThanOrEqual(1)
    }
  })

  /** サインインしなくても使えることが、この画面の一番大事な前提。 */
  test('サインイン不要であることを最初に伝える', () => {
    render(<HomeScreen {...slots} />)
    expect(document.body.textContent ?? '').toContain('サインインしなくても')
  })

  test('リンク文言だけで行き先が分かる（AAA 2.4.9）', () => {
    render(<HomeScreen {...slots} />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(/^(こちら|詳細|もっと見る|ここ)$/)
      expect((link.textContent ?? '').length).toBeGreaterThan(3)
    }
  })
})
