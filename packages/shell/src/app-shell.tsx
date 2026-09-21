import type { ReactNode } from 'react'
import type { ComponentType } from 'react'
import type { NavLinkRenderer } from './link-renderer.ts'

type GlobalNavLike = ComponentType<{
  readonly currentPath: string
  readonly renderLink?: NavLinkRenderer
}>

export type AppShellBrand = {
  /** ヘッダーのサイト名（h1 にはしない） */
  readonly name: string
  /** フッターの一文（例: 「qrcc — QR コードと…」） */
  readonly tagline: string
}

type AppShellProps = {
  readonly currentPath: string
  readonly children: ReactNode
  readonly renderLink?: NavLinkRenderer
  /**
   * ヘッダー右側に出す状態表示。サインイン状態などを差し込むための口で、
   * shell 自身は中身を知らない（feature への依存を作らないため）。
   */
  readonly status?: ReactNode
}

/**
 * ページ共通の骨格。ランドマークをここで揃える。
 *
 * サイト名は `h1` にしない。`h1` はページごとの主題に使い、
 * 見出しの一覧だけでページ構造が読めるようにする（AAA 2.4.10）。
 */
export const makeAppShell = (prefix: string, brand: AppShellBrand, GlobalNav: GlobalNavLike) => {
  const AppShell = ({ currentPath, children, renderLink, status }: AppShellProps) => (
    <>
      <header className={`${prefix}-header`}>
        <p className={`${prefix}-header__brand`}>{brand.name}</p>
        <GlobalNav
          currentPath={currentPath}
          {...(renderLink === undefined ? {} : { renderLink })}
        />
        {status === undefined ? undefined : (
          <div className={`${prefix}-header__status`}>{status}</div>
        )}
      </header>
      {/* スキップリンクの飛び先。tabIndex=-1 がないと読み上げ位置が動かない */}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className={`${prefix}-footer`}>
        <p>{brand.tagline}</p>
      </footer>
    </>
  )
  return AppShell
}
