import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { useState } from 'react'
import { parseActorWire } from '@noter/auth/contract'
import { AccountSettingsScreen, makeBrowserAuthActions } from '@noter/auth/ui'
import type { NavLinkRenderer } from '@noter/shell/ui'
import type { AuthEnvSnapshot } from './auth-env.route.ts'
import { readAuthEnv } from './auth-env.route.ts'

const accountStateFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthEnvSnapshot> => readAuthEnv(env, getRequest()),
)

/** ルータへの依存はルートファイルに閉じ込める（画面はルータなしでテストできる）。 */
const routerLink: NavLinkRenderer = ({ to, label, isCurrent }) => (
  <Link to={to} {...(isCurrent ? { 'aria-current': 'page' } : {})}>
    {label}
  </Link>
)

const Settings = () => {
  const state = Route.useLoaderData()
  const router = useRouter()
  const [actions] = useState(() => makeBrowserAuthActions({ callbackURL: '/settings/account' }))

  return (
    <AccountSettingsScreen
      actor={parseActorWire(state.actor)}
      actions={actions}
      isGoogleAvailable={state.isGoogleAvailable}
      renderLink={routerLink}
      onChanged={() => void router.invalidate()}
    />
  )
}

export const Route = createFileRoute('/settings/account')({
  loader: () => accountStateFn(),
  component: Settings,
})
