import type { ReactNode } from 'react'
import { GlobalNav } from './global-nav.tsx'
import type { NavLinkRenderer } from './link-renderer.ts'

type AppShellProps = {
  readonly currentPath: string
  readonly children: ReactNode
  readonly renderLink?: NavLinkRenderer
}

/**
 * ページ共通の骨格。ランドマークをここで揃える。
 *
 * サイト名は `h1` にしない。`h1` はページごとの主題に使い、
 * 見出しの一覧だけでページ構造が読めるようにする（AAA 2.4.10）。
 */
export const AppShell = ({ currentPath, children, renderLink }: AppShellProps) => (
  <>
    <header className="qrcc-header">
      <p className="qrcc-header__brand">qrcc</p>
      <GlobalNav currentPath={currentPath} {...(renderLink === undefined ? {} : { renderLink })} />
    </header>
    {/* スキップリンクの飛び先。tabIndex=-1 がないと読み上げ位置が動かない */}
    <main id="main" tabIndex={-1}>
      {children}
    </main>
    <footer className="qrcc-footer">
      <p>qrcc — QR コードとバーコードの生成・読み取り・管理・印刷</p>
    </footer>
  </>
)
