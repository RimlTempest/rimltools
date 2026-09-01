/**
 * グローバルナビの項目。
 *
 * `apps/web/src/routes.ts`（URL 構造）と対になる、feature を横断する数少ない場所。
 * 新しい画面を足すレーンは、ここに 1 行追記する（append-only なので競合しにくい）。
 *
 * 文言は**単体で行き先が分かる**ものにする（AAA 2.4.9）。
 */
export type NavItem = {
  readonly to: string
  readonly label: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'ホーム' },
  { to: '/generate', label: 'コードを作る' },
  { to: '/print', label: '印刷とラベル' },
  { to: '/scan', label: 'コードを読み取る' },
  { to: '/settings', label: '設定' },
  { to: '/sign-in', label: 'サインイン' },
  // TODO(feat/scan): { to: '/scan', label: 'コードを読み取る' }
  // TODO(feat/manage): { to: '/codes', label: '保存したコード' }
]
