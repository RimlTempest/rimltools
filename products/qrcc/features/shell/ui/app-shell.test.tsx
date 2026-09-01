import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { AppShell } from './app-shell.tsx'

afterEach(cleanup)

describe('AppShell', () => {
  test('ランドマークが揃っている', () => {
    render(<AppShell currentPath="/">本文</AppShell>)
    expect(screen.getByRole('banner')).toBeDefined()
    expect(screen.getByRole('navigation', { name: 'グローバル' })).toBeDefined()
    expect(screen.getByRole('main')).toBeDefined()
    expect(screen.getByRole('contentinfo')).toBeDefined()
  })

  test('main はスキップリンクの飛び先になれる', () => {
    render(<AppShell currentPath="/">本文</AppShell>)
    const main = screen.getByRole('main')
    expect(main.id).toBe('main')
    // フォーカスを受け取れないとスキップしても読み上げ位置が動かない
    expect(main.getAttribute('tabindex')).toBe('-1')
  })

  test('子要素が main の中に入る', () => {
    render(<AppShell currentPath="/">本文</AppShell>)
    expect(screen.getByRole('main').textContent).toContain('本文')
  })

  test('status を渡すとヘッダーに出る', () => {
    render(
      <AppShell currentPath="/" status={<p>ゲストとして利用中</p>}>
        本文
      </AppShell>,
    )
    expect(screen.getByRole('banner').textContent).toContain('ゲストとして利用中')
  })

  test('status が無くてもヘッダーは壊れない', () => {
    render(<AppShell currentPath="/">本文</AppShell>)
    expect(screen.getByRole('banner')).toBeDefined()
    expect(screen.getByRole('navigation', { name: 'グローバル' })).toBeDefined()
  })

  test('サイト名は h1 ではなく、ページ側の h1 を邪魔しない', () => {
    render(
      <AppShell currentPath="/">
        <h1>ページ見出し</h1>
      </AppShell>,
    )
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('ページ見出し')
  })
})
