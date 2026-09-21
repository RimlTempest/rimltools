import { Link } from '@tanstack/react-router'
import type { NavLinkRenderer } from './link-renderer.ts'

/**
 * TanStack Router を使うリンク描画。
 *
 * ルータへの依存をこのファイルだけに閉じ込めるので、
 * `@rimltools/shell` のコンポーネントはルータなしでテストできる。
 */
export const routerLink: NavLinkRenderer = ({ to, label, isCurrent }) => (
  <Link to={to} {...(isCurrent ? { 'aria-current': 'page' } : {})}>
    {label}
  </Link>
)
