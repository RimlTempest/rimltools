import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Breadcrumbs } from './breadcrumbs.tsx'

afterEach(cleanup)

const SINGLE = [{ to: '/', label: 'ホーム' }] as const

const TRAIL = [
  { to: '/', label: 'ホーム' },
  { to: '/settings', label: '設定' },
] as const

describe('Breadcrumbs', () => {
  test('パンくず用の nav として名前を持つ', () => {
    render(<Breadcrumbs trail={TRAIL} />)
    expect(screen.getByRole('navigation', { name: 'パンくず' })).toBeDefined()
  })

  test('順序付きリストで並ぶ', () => {
    const { container } = render(<Breadcrumbs trail={TRAIL} />)
    expect(container.querySelector('ol')).not.toBeNull()
  })

  test('最後の項目が現在地で、リンクにしない', () => {
    render(<Breadcrumbs trail={TRAIL} />)
    expect(screen.queryByRole('link', { name: '設定' })).toBeNull()
    const current = screen.getByText('設定')
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  test('途中の項目はリンクになる', () => {
    render(<Breadcrumbs trail={TRAIL} />)
    expect(screen.getByRole('link', { name: 'ホーム' }).getAttribute('href')).toBe('/')
  })

  test('区切り記号は読み上げさせない（装飾）', () => {
    const { container } = render(<Breadcrumbs trail={TRAIL} />)
    for (const separator of container.querySelectorAll('[data-separator]')) {
      expect(separator.getAttribute('aria-hidden')).toBe('true')
    }
  })

  test('1 項目だけならリンクを作らない', () => {
    render(<Breadcrumbs trail={SINGLE} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
