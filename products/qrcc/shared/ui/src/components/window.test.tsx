import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Window } from './window.tsx'

afterEach(cleanup)

describe('Window', () => {
  test('題をアクセシブル名に持つ region として描画される', () => {
    render(<Window title="読み取り結果">中身</Window>)
    const region = screen.getByRole('region', { name: '読み取り結果' })
    expect(region.className).toBe('rd-window')
    expect(screen.getByRole('heading', { level: 2, name: '読み取り結果' }).className).toBe(
      'rd-window-title',
    )
    expect(region.querySelector('.rd-window-body')?.textContent).toBe('中身')
  })

  test('見出しの段は変えられる', () => {
    render(
      <Window title="詳細" headingLevel={3}>
        x
      </Window>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '詳細' })).toBeDefined()
  })

  test('トーンは見出し（帯）の data-tone で渡し、既定では付かない', () => {
    render(
      <Window title="注意" tone="warning">
        x
      </Window>,
    )
    expect(screen.getByRole('heading', { name: '注意' }).dataset['tone']).toBe('warning')
    cleanup()
    render(<Window title="ふつう">x</Window>)
    expect(screen.getByRole('heading', { name: 'ふつう' }).dataset['tone']).toBeUndefined()
  })

  test('id を渡すとその id が section に付き、aria-labelledby は見出しを指す', () => {
    render(
      <Window title="題" id="result">
        x
      </Window>,
    )
    const region = screen.getByRole('region', { name: '題' })
    expect(region.id).toBe('result')
    const labelledBy = region.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelledBy)?.textContent).toBe('題')
  })
})
