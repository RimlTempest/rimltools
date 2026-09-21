import { describe, expect, test } from 'bun:test'
import { createThemeKit } from './theme.ts'

const { THEME_STORAGE_KEY, makeThemeStore, themeInitScript } = createThemeKit('rt-theme')

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

describe('createThemeKit', () => {
  test('保存キーはプロダクトが渡したもの（既存利用者の設定を保つため変えない）', () => {
    expect(createThemeKit('qrcc-theme').THEME_STORAGE_KEY).toBe('qrcc-theme')
    expect(createThemeKit('noter-theme').themeInitScript).toContain('"noter-theme"')
  })
})

describe('themeInitScript の埋め込み', () => {
  test('保存キーに script を閉じる文字列や改行があっても、そのまま埋め込まない', () => {
    const { themeInitScript: script } = createThemeKit('x</script><script>alert(1)</script>\u2028y')
    expect(script).not.toContain('</script>')
    expect(script).not.toContain('<')
    expect(script).not.toContain('\u2028')
  })

  test('エスケープしても、埋め込んだリテラルは渡した保存キーと同じ文字列を表す', () => {
    const key = 'weird</script>"\'\\key\u2028'
    const { themeInitScript: script } = createThemeKit(key)
    const literal = /localStorage\.getItem\((".*?")\);/.exec(script)?.[1]
    expect(literal).toBeDefined()
    expect(JSON.parse(literal ?? 'null')).toBe(key)
  })
})
