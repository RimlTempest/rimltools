import { describe, expect, test } from 'bun:test'
import { THEME_STORAGE_KEY, makeThemeStore, themeInitScript } from './theme.ts'

const fakeStorage = (initial: Record<string, string> = {}) => {
  const values = { ...initial }
  return {
    store: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value
      },
      removeItem: (key: string) => {
        delete values[key]
      },
    },
    values,
  }
}

const fakeRoot = (): { dataset: Record<string, string | undefined> } => ({ dataset: {} })

describe('テーマの保存と反映', () => {
  test('未設定なら system', () => {
    const { store } = fakeStorage()
    expect(makeThemeStore(store, fakeRoot()).read()).toBe('system')
  })

  test('保存済みの値を読む', () => {
    const { store } = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' })
    expect(makeThemeStore(store, fakeRoot()).read()).toBe('dark')
  })

  test('壊れた値は system に倒す（例外にしない）', () => {
    const { store } = fakeStorage({ [THEME_STORAGE_KEY]: 'ultraviolet' })
    expect(makeThemeStore(store, fakeRoot()).read()).toBe('system')
  })

  test('light/dark を選ぶと保存され、ルート要素にも反映される', () => {
    const { store, values } = fakeStorage()
    const root = fakeRoot()
    makeThemeStore(store, root).write('dark')
    expect(values[THEME_STORAGE_KEY]).toBe('dark')
    expect(root.dataset['theme']).toBe('dark')
  })

  test('system を選ぶと保存を消し、ルート要素の指定も外す（OS 設定に戻す）', () => {
    const { store, values } = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' })
    const root = fakeRoot()
    root.dataset['theme'] = 'dark'
    makeThemeStore(store, root).write('system')
    expect(values[THEME_STORAGE_KEY]).toBeUndefined()
    expect(root.dataset['theme']).toBeUndefined()
  })

  test('storage が使えなくても壊れない（プライベートブラウズなど）', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const root = fakeRoot()
    const store = makeThemeStore(throwing, root)
    expect(store.read()).toBe('system')
    store.write('light')
    // 保存できなくても、その場の表示は切り替わる
    expect(root.dataset['theme']).toBe('light')
  })
})

describe('初期化スクリプト', () => {
  test('保存キーを含む（shell 側と定義がずれない）', () => {
    expect(themeInitScript).toContain(THEME_STORAGE_KEY)
  })

  test('例外を握って落ちない形になっている', () => {
    expect(themeInitScript).toContain('catch')
  })
})
