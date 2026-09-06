import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ThemePreference, ThemeStore } from '@noter/ui'
import { SettingsScreen } from './settings-screen.tsx'

afterEach(cleanup)

const fakeStore = () => {
  let current: ThemePreference = 'system'
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

describe('SettingsScreen', () => {
  test('パンくずで現在位置が分かる（AAA 2.4.8）', () => {
    const { store } = fakeStore()
    render(<SettingsScreen themeStore={store} />)
    const breadcrumbs = screen.getByRole('navigation', { name: 'パンくず' })
    expect(breadcrumbs.textContent).toContain('文書一覧')
    expect(breadcrumbs.textContent).toContain('アカウント設定')
  })

  test('テーマを選ぶと store に書き込まれる', async () => {
    const { store, written } = fakeStore()
    render(<SettingsScreen themeStore={store} />)
    await userEvent.click(screen.getByRole('radio', { name: 'ダーク' }))
    expect(written).toEqual(['dark'])
  })

  test('外観の設定に見出しと説明が付く（AAA 3.3.5）', () => {
    const { store } = fakeStore()
    render(<SettingsScreen themeStore={store} />)
    expect(screen.getByRole('heading', { level: 2, name: '外観' })).toBeDefined()
    expect(screen.getByRole('group', { name: 'テーマ' })).toBeDefined()
  })
})
