/**
 * noter のページ骨格。共通の部品（`@rimltools/shell`）に noter の値を渡して作る。
 */
import { createShell } from '@rimltools/shell'
import { SkipLink, themeInitScript } from '@noter/ui'
import { NAV_ITEMS } from './nav-items.ts'

export const { AppShell, Breadcrumbs, GlobalNav, RootDocument, documentHead } = createShell({
  prefix: 'noter',
  brand: {
    name: 'noter',
    tagline: 'noter — markdown・yaml・toml・json を複数人で同時に編集するノート',
  },
  navItems: NAV_ITEMS,
  SkipLink,
  themeInitScript,
  themeColor: { light: '#ffffff', dark: '#0f1217' },
  title: 'noter — 共同編集ノート',
  description:
    'markdown・yaml・toml・json を複数人で同時に編集できるノート。共有リンクを開くだけで参加できます。',
})
