import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import type { ActorWire } from '@noter/auth/contract'
import { parseActorWire } from '@noter/auth/contract'
import type { AuthLinkRenderer } from '@noter/auth/ui'
import { AuthStatus } from '@noter/auth/ui'
import { currentActorWire } from '@noter/auth/ui/auth-env'
import { AppShell } from './app-shell.tsx'
import { registerServiceWorker } from './register-sw.ts'
import { RootDocument, documentHead } from './root-document.tsx'
import { routerLink } from './router-link.tsx'
// スタイルの組み立てはアプリの責務。feature からは href を受け取るだけ。
import appCss from '../../../apps/web/src/styles/app.css?url'

const Shell = ({ children }: { readonly children: React.ReactNode }) => (
  <RootDocument>
    <HeadContent />
    {children}
    <Scripts />
  </RootDocument>
)

/**
 * いま誰が使っているか。Cookie は HttpOnly なので判定は必ずサーバで行い、
 * 画面には検証済みの値だけを渡す（ADR-0010）。
 */
const currentActorFn = createServerFn({ method: 'GET' }).handler(async (): Promise<ActorWire> =>
  currentActorWire(env, getRequest()),
)

const statusLink: AuthLinkRenderer = ({ to, label }) => <Link to={to}>{label}</Link>

const Layout = () => {
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  const { actor } = Route.useRouteContext()

  /*
   * Service Worker はハイドレーション後にだけ登録する（SSR では navigator が
   * 無い）。開発ビルドでは登録しない — SW が挟まると、直したはずのものが
   * 古いキャッシュから返り、原因の切り分けができなくなる。
   */
  useEffect(() => {
    if (!import.meta.env.PROD) return
    registerServiceWorker(typeof navigator === 'undefined' ? undefined : navigator.serviceWorker)
  }, [])

  return (
    <AppShell
      currentPath={currentPath}
      renderLink={routerLink}
      status={<AuthStatus actor={parseActorWire(actor)} renderLink={statusLink} />}
    >
      <Outlet />
    </AppShell>
  )
}

export const Route = createRootRoute({
  head: documentHead(appCss),
  // ヘッダーのログイン状態は全画面で要るので、根で 1 度だけ引く
  beforeLoad: async (): Promise<{ readonly actor: ActorWire }> => ({
    actor: await currentActorFn(),
  }),
  shellComponent: Shell,
  component: Layout,
})
