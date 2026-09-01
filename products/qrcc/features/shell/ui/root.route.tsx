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
import { currentActorWire } from '../../auth/ui/auth-env.route.ts'
import { AppShell } from './app-shell.tsx'
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

/** 全画面のヘッダーに出すため、サインイン状態はルートで一度だけ判定する。 */
const actorFn = createServerFn({ method: 'GET' }).handler(async (): Promise<ActorWire> =>
  currentActorWire(env, getRequest()),
)

const Layout = () => {
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  const actor = Route.useLoaderData()

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
