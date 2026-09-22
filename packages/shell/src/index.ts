/**
 * @rimltools/shell — 全プロダクト共通のページ骨格（ヘッダー・グローバルナビ・パンくず・
 * HTML ドキュメント・Service Worker 登録・テレメトリ起動）。
 *
 * プロダクト固有のもの（クラス名の接頭辞・サイト名・ナビ項目・タイトル・テーマ色・
 * SkipLink とテーマ初期化スクリプト）は `createShell` に渡す。ルート（root.route.tsx）は
 * 認証や読み込みの形がプロダクトごとに違うので、プロダクトに置いてここの部品を使う。
 */
import type { AppShellBrand } from './app-shell.tsx'
import { makeAppShell } from './app-shell.tsx'
import { makeBreadcrumbs } from './breadcrumbs.tsx'
import { makeGlobalNav } from './global-nav.tsx'
import type { NavItem } from './nav-item.ts'
import type { DocumentConfig } from './root-document.tsx'
import { makeDocumentHead, makeRootDocument } from './root-document.tsx'

export type { AppShellBrand } from './app-shell.tsx'
export type { NavLinkRenderer } from './link-renderer.ts'
export type { NavItem } from './nav-item.ts'
export type { DocumentConfig } from './root-document.tsx'
export type { ServiceWorkerContainerLike } from './register-sw.ts'
export { HYDRATED_ATTRIBUTE } from './hydration-marker.tsx'
export { registerServiceWorker } from './register-sw.ts'
export { routerLink } from './router-link.tsx'
export { scheduleTelemetry } from './telemetry.ts'

export type ShellConfig = DocumentConfig & {
  /** クラス名の接頭辞（例: `qrcc` → `qrcc-header`）。CSS はプロダクトが持つ */
  readonly prefix: string
  readonly brand: AppShellBrand
  readonly navItems: readonly NavItem[]
}

export const createShell = (config: ShellConfig) => {
  const GlobalNav = makeGlobalNav(config.prefix, config.navItems)
  return {
    GlobalNav,
    Breadcrumbs: makeBreadcrumbs(config.prefix),
    AppShell: makeAppShell(config.prefix, config.brand, GlobalNav),
    RootDocument: makeRootDocument(config),
    documentHead: makeDocumentHead(config),
  }
}
