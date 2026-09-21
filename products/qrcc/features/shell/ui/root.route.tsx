import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import type { ActorWire } from '@qrcc/auth/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import { AuthStatus } from '@qrcc/auth/ui'
import { currentActorWire } from '@qrcc/auth/ui/auth-env'
import { registerServiceWorker, routerLink, scheduleTelemetry } from '@rimltools/shell'
import { AppShell, RootDocument, documentHead } from './shell-kit.tsx'
// スタイルの組み立てはアプリの責務。feature からは href を受け取るだけ。
import appCss from '../../../apps/web/src/styles/app.css?url'

const Shell = ({ children }: { readonly children: React.ReactNode }) => (
  <RootDocument>
    <HeadContent />
    {children}
    <Scripts />
  </RootDocument>
)

/** 全画面のヘッダーに出すため、サインイン状態はルートで一度だけ判定する。 */
const actorFn = createServerFn({ method: 'GET' }).handler(async (): Promise<ActorWire> =>
  currentActorWire(env, getRequest()),
)

const Layout = () => {
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  const actor = Route.useLoaderData()

  // ハイドレーション後だけ登録する（SSR では navigator が無い）
  useEffect(() => {
    registerServiceWorker(typeof navigator === 'undefined' ? undefined : navigator.serviceWorker)
    // SSR のバンドルに Faro を入れない（Worker のサイズ上限を守る）
    if (!import.meta.env.SSR) scheduleTelemetry()
  }, [])

  return (
    <AppShell
      currentPath={currentPath}
      renderLink={routerLink}
      status={
        <AuthStatus
          actor={parseActorWire(actor)}
          // ヘッダーは常駐なので読み上げ領域にしない（ページ側の通知と競合する）
          announce={false}
          // AuthStatus のリンクは現在地の概念を持たないので、その分だけ補う
          renderLink={({ to, label }) => routerLink({ to, label, isCurrent: false })}
        />
      }
    >
      <Outlet />
    </AppShell>
  )
}

export const Route = createRootRoute({
  loader: () => actorFn(),
  head: documentHead(appCss),
  shellComponent: Shell,
  component: Layout,
})
