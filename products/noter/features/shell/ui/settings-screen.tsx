import { useSyncExternalStore } from 'react'
import { ThemeToggle, makeThemeStore } from '@noter/ui'
import type { ThemeStore } from '@noter/ui'
import { Breadcrumbs } from './breadcrumbs.tsx'
import type { NavItem } from './nav-items.ts'
import type { NavLinkRenderer } from './link-renderer.ts'

type SettingsScreenProps = {
  /** 既定はブラウザの localStorage と documentElement。テストでは偽物を渡す。 */
  readonly themeStore?: ThemeStore
  readonly renderLink?: NavLinkRenderer
}

const TRAIL: readonly NavItem[] = [
  { to: '/', label: '文書一覧' },
  { to: '/settings/account', label: 'アカウント設定' },
]

const browserThemeStore = (): ThemeStore =>
  makeThemeStore(globalThis.localStorage, globalThis.document.documentElement)

const neverChanges = () => () => {}

/**
 * アカウント設定画面。
 *
 * テーマの現在値は localStorage にあり、サーバ側では読めない。
 * SSR の出力とハイドレーション後の表示が食い違わないよう、
 * ハイドレーション後にだけ実ストアを作る（テストでは `themeStore` を直接渡す）。
 * `useSyncExternalStore` を使うのは、これがサーバ用スナップショットを
 * 明示できる唯一の仕組みだから（effect で setState すると余計な再描画になる）。
 */
export const SettingsScreen = ({ themeStore, renderLink }: SettingsScreenProps) => {
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const store = themeStore ?? (isHydrated ? browserThemeStore() : undefined)

  return (
    <>
      <Breadcrumbs trail={TRAIL} {...(renderLink === undefined ? {} : { renderLink })} />
      <h1>アカウント設定</h1>

      <h2>外観</h2>
      <p>既定ではお使いの端末の設定に従います。明示的に選ぶと、この端末にだけ記憶されます。</p>
      {store === undefined ? (
        <noscript>
          <p>テーマの切り替えには JavaScript が必要です。端末の外観設定はそのまま反映されます。</p>
        </noscript>
      ) : (
        <ThemeToggle store={store} />
      )}
    </>
  )
}
