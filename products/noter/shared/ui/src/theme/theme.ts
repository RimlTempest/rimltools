/**
 * テーマ設定の保存と反映。
 *
 * 既定は OS 設定（`color-scheme: light dark` + `light-dark()`）に任せ、
 * ユーザーが明示的に選んだときだけ `data-theme` で上書きする。
 * storage への読み書きは失敗しうる（プライベートブラウズ等）ので、
 * 失敗しても表示だけは切り替わるようにしてある。
 */
export const THEME_STORAGE_KEY = 'noter-theme'

const THEME_PREFERENCE = {
  system: 'system',
  light: 'light',
  dark: 'dark',
} as const

export type ThemePreference = (typeof THEME_PREFERENCE)[keyof typeof THEME_PREFERENCE]

export type ThemeStore = {
  readonly read: () => ThemePreference
  readonly write: (preference: ThemePreference) => void
}

/** 依存は引数で受け取る。テストでは素のオブジェクトを渡す。 */
type StorageLike = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

type ThemeRoot = { dataset: { [key: string]: string | undefined } }

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === THEME_PREFERENCE.light
  || value === THEME_PREFERENCE.dark
  || value === THEME_PREFERENCE.system

export const makeThemeStore = (storage: StorageLike, root: ThemeRoot): ThemeStore => {
  const read = (): ThemePreference => {
    try {
      const stored = storage.getItem(THEME_STORAGE_KEY)
      return isThemePreference(stored) ? stored : THEME_PREFERENCE.system
    } catch {
      // storage が使えない環境では OS 設定に従う
      return THEME_PREFERENCE.system
    }
  }

  const write = (preference: ThemePreference) => {
    // 表示の切り替えは保存の成否に依存させない
    if (preference === THEME_PREFERENCE.system) {
      delete root.dataset['theme']
    } else {
      root.dataset['theme'] = preference
    }
    try {
      if (preference === THEME_PREFERENCE.system) {
        storage.removeItem(THEME_STORAGE_KEY)
      } else {
        storage.setItem(THEME_STORAGE_KEY, preference)
      }
    } catch {
      // 保存できないだけで、この場の表示は切り替わっている
    }
  }

  return { read, write }
}

/**
 * `<head>` に同期実行で差し込むスクリプト。
 *
 * 最初の描画より前に `data-theme` を当てないと、OS 設定と選択が食い違う瞬間に
 * 色がちらつく。定義がずれないよう、保存キーはここから組み立てる。
 */
export const themeInitScript = `(()=>{try{const t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}})()`
