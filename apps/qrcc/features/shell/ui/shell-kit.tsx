/**
 * qrcc のページ骨格。共通の部品（`@rimltools/shell`）に qrcc の値を渡して作る。
 */
import { createShell } from '@rimltools/shell'
import { SkipLink, themeInitScript } from '@qrcc/ui'
import { NAV_ITEMS } from './nav-items.ts'

export const { AppShell, Breadcrumbs, GlobalNav, RootDocument, documentHead } = createShell({
  prefix: 'qrcc',
  brand: { name: 'qrcc', tagline: 'qrcc — QR コードとバーコードの生成・読み取り・管理・印刷' },
  navItems: NAV_ITEMS,
  SkipLink,
  themeInitScript,
  themeColor: { light: '#ffffff', dark: '#0f1217' },
  title: 'qrcc — QR・バーコード管理',
  description:
    'QR コードとバーコードを生成・読み取り・管理・印刷できるツール。生成と読み取りは端末側で動くので、ログインなしでも使えます。',
})
