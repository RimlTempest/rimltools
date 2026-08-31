import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { RootDocument, documentHead } from './root-document.tsx'

const Shell = ({ children }: { readonly children: React.ReactNode }) => (
  <RootDocument>
    <HeadContent />
    {children}
    <Scripts />
  </RootDocument>
)

export const Route = createRootRoute({
  head: documentHead,
  shellComponent: Shell,
  component: Outlet,
})
