import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
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

const Layout = () => {
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  return (
    <AppShell currentPath={currentPath} renderLink={routerLink}>
      <Outlet />
    </AppShell>
  )
}

export const Route = createRootRoute({
  head: documentHead(appCss),
  shellComponent: Shell,
  component: Layout,
})
