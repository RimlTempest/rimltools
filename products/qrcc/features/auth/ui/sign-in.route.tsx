import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { useState } from 'react'
// ルートは apps/web 側の配線なので、feature の公開サブパス越しに使う。
// routeTree.gen.ts が loader の型を書けるようにするため（相対パスだと名前を付けられない）
import type { ActorWire } from '@qrcc/auth/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import { currentActorWire } from './auth-env.route.ts'
import { isGoogleConfigured } from '../server/from-env.ts'
import { makeBrowserAuthActions } from './browser-auth-client.ts'
import { SignInScreen } from './sign-in-screen.tsx'

type SignInState = {
  readonly actor: ActorWire
  readonly isGoogleAvailable: boolean
}

/**
 * いまのサインイン状態をサーバで判定して渡す。
 *
 * Cookie は HttpOnly なのでブラウザからは読めない。判定は必ずサーバで行い、
 * 画面には検証済みの値だけを渡す。
 */
const signInStateFn = createServerFn({ method: 'GET' }).handler(async (): Promise<SignInState> => {
  return {
    actor: await currentActorWire(env, getRequest()),
    isGoogleAvailable: isGoogleConfigured(env),
  }
})

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
      onSignedIn={() => void router.invalidate()}
      onSignedOut={() => void router.invalidate()}
    />
  )
}

export const Route = createFileRoute('/sign-in')({
  loader: () => signInStateFn(),
  component: SignIn,
})
