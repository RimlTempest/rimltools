import type { NavLinkRenderer } from './link-renderer.ts'
import { NAV_ITEMS } from './nav-items.ts'

type GlobalNavProps = {
  /** 現在の URL パス。前方一致ではなく完全一致で現在地を決める。 */
  readonly currentPath: string
  readonly renderLink?: NavLinkRenderer
}

const defaultRenderLink: NavLinkRenderer = ({ to, label, isCurrent }) => (
  <a href={to} {...(isCurrent ? { 'aria-current': 'page' } : {})}>
    {label}
  </a>
)

/**
 * グローバルナビ。
 *
 * `ul`/`li` で並べるのは、支援技術に「何項目あるか」を伝えるため。
 * 現在地は `aria-current="page"` で示す（AAA 2.4.8）。
 */
export const GlobalNav = ({ currentPath, renderLink = defaultRenderLink }: GlobalNavProps) => (
  <nav aria-label="グローバル" className="noter-global-nav">
    <ul>
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>{renderLink({ ...item, isCurrent: item.to === currentPath })}</li>
      ))}
    </ul>
  </nav>
)
