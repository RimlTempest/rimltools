/**
 * グローバルナビの項目。
 *
 * `apps/web/src/routes.ts`（URL 構造）と対になる、feature を横断する数少ない場所。
 * 新しい画面を足すレーンは、ここに 1 行追記する（append-only なので競合しにくい）。
 *
 * 文言は**単体で行き先が分かる**ものにする（AAA 2.4.9）。
 */
import type { NavItem } from '@rimltools/shell'

export type { NavItem } from '@rimltools/shell'

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: '文書一覧' },
  { to: '/settings/account', label: 'アカウント設定' },
]
