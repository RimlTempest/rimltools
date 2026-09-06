import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ThemePreference, ThemeStore } from './theme.ts'
import { ThemeToggle } from './theme-toggle.tsx'

afterEach(cleanup)

const fakeStore = (initial: ThemePreference = 'system') => {
  let current = initial
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

describe('ThemeToggle', () => {
  test('ラジオグループとして描画され、legend が名前になる', () => {
    const { store } = fakeStore()
    render(<ThemeToggle store={store} />)
    expect(screen.getByRole('group', { name: 'テーマ' })).toBeDefined()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  test('現在の設定が選択されている', () => {
    const { store } = fakeStore('dark')
    render(<ThemeToggle store={store} />)
    const dark = screen.getByRole('radio', { name: 'ダーク' })
    expect(dark.getAttribute('checked') !== null || dark.matches(':checked')).toBe(true)
  })

  test('選び直すと store に書き込まれる', async () => {
    const { store, written } = fakeStore()
    render(<ThemeToggle store={store} />)
    await userEvent.click(screen.getByRole('radio', { name: 'ライト' }))
    expect(written).toEqual(['light'])
  })

  test('選択肢は端末設定・ライト・ダークの 3 つ', () => {
    const { store } = fakeStore()
    render(<ThemeToggle store={store} />)
    for (const name of ['端末の設定に合わせる', 'ライト', 'ダーク']) {
      expect(screen.getByRole('radio', { name })).toBeDefined()
    }
  })
})
