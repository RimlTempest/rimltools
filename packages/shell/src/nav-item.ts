/** ナビゲーションの 1 項目。項目の一覧はプロダクトが持つ（`createShell` に渡す）。 */
export type NavItem = {
  readonly to: string
  readonly label: string
}
