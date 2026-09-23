import type { NavItem } from './nav-item.ts'
import type { NavLinkRenderer } from './link-renderer.ts'

type BreadcrumbsProps = {
  /** ルートから現在地まで。最後の項目が現在地。 */
  readonly trail: readonly NavItem[]
  readonly renderLink?: NavLinkRenderer
}

const defaultRenderLink: NavLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>

/**
 * 現在位置を示すパンくず（AAA 2.4.8）。
 *
 * - 順序があるので `ol`
 * - 現在地はリンクにしない（押しても何も起きないリンクを作らない）
 * - 区切り記号は装飾なので読み上げさせない
 */
export const makeBreadcrumbs = (prefix: string) => {
  const Breadcrumbs = ({ trail, renderLink = defaultRenderLink }: BreadcrumbsProps) => (
    <nav aria-label="パンくず" className={`${prefix}-breadcrumbs`}>
      <ol>
        {trail.map((item, index) => {
          const isCurrent = index === trail.length - 1
          return (
            <li key={item.to}>
              {index > 0 ? (
                <span data-separator aria-hidden="true">
                  /
                </span>
              ) : undefined}
              {isCurrent ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                renderLink({ ...item, isCurrent: false })
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
  return Breadcrumbs
}
