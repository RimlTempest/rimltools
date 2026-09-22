import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { useState } from 'react'
// ルートは apps/web 側の配線なので、feature の公開サブパス越しに使う。
// routeTree.gen.ts が loader の型を書けるようにするため
import { parseActorWire } from '@noter/auth/contract'
import { SignInScreen, makeBrowserAuthActions } from '@noter/auth/ui'
import type { AuthEnvSnapshot } from './auth-env.route.ts'
import { readAuthEnv } from './auth-env.route.ts'

/**
 * いまのログイン状態をサーバで判定して渡す。
 *
 * Cookie は HttpOnly なのでブラウザからは読めない。判定は必ずサーバで行い、
 * 画面には検証済みの値だけを渡す。
 */
const signInStateFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthEnvSnapshot> => readAuthEnv(env, getRequest()),
)

const SignIn = () => {
  const state = Route.useLoaderData()
  const router = useRouter()
  // クライアントは 1 度だけ作る。SSR 中は作らない（遅延初期化）
  const [actions] = useState(() => makeBrowserAuthActions({ callbackURL: '/' }))

  return (
    <SignInScreen
      actor={parseActorWire(state.actor)}
      actions={actions}
      isGoogleAvailable={state.isGoogleAvailable}
      onSignedIn={() => void router.navigate({ to: '/' })}
      onSignedOut={() => void router.invalidate()}
    />
  )
}

export const Route = createFileRoute('/sign-in')({
  loader: () => signInStateFn(),
  component: SignIn,
})
