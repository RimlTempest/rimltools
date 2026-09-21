import { useId, useState } from 'react'
import type { ThemePreference, ThemeStore } from './theme.ts'

type ThemeToggleProps = {
  readonly store: ThemeStore
  readonly legend?: string
}

const OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: '端末の設定に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
]

/**
 * テーマの選択。
 *
 * 3 択なのでラジオグループが素直で、キーボード操作もブラウザ任せにできる。
 * `fieldset`/`legend` がグループ名になるので `aria-label` は要らない。
 */
export const makeThemeToggle = (prefix: string) => {
  const ThemeToggle = ({ store, legend = 'テーマ' }: ThemeToggleProps) => {
    const groupName = useId()
    const [preference, setPreference] = useState<ThemePreference>(store.read)

    const choose = (next: ThemePreference) => {
      setPreference(next)
      store.write(next)
    }

    return (
      <fieldset className={`${prefix}-theme-toggle`}>
        <legend>{legend}</legend>
        {OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={preference === option.value}
              onChange={() => choose(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    )
  }
  return ThemeToggle
}
