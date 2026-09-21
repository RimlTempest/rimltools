/**
 * ブラウザ側のサインイン操作（Better Auth のクライアント）。
 *
 * 画面はこのモジュールを import しない。ルート（composition root）が
 * 組み立てて `SignInScreen` に渡すので、画面はテストで偽物を受け取れる。
 */
import { createAuthClient } from 'better-auth/client'
import { anonymousClient } from 'better-auth/client/plugins'
import type { AuthActionResult, AuthActions } from './auth-actions.ts'

type BrowserAuthDeps = {
  /** サインイン後に戻る場所。 */
  readonly callbackURL: string
}

const readMessage = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return '原因不明'
  const message: unknown = Reflect.get(error, 'message')
  const statusText: unknown = Reflect.get(error, 'statusText')
  if (typeof message === 'string' && message !== '') return message
  if (typeof statusText === 'string' && statusText !== '') return statusText
  return '原因不明'
}

/** Better Auth のクライアントは `{ data, error }` を返す。`Result` に変換する。 */
const toResult = (outcome: { readonly error?: unknown }): AuthActionResult =>
  outcome.error === null || outcome.error === undefined
    ? { ok: true, value: undefined }
    : { ok: false, error: { kind: 'unavailable', detail: readMessage(outcome.error) } }

export const makeBrowserAuthActions = (deps: BrowserAuthDeps): AuthActions => {
  // baseURL は指定しない。表示中のオリジンをそのまま使う
  const client = createAuthClient({ plugins: [anonymousClient()] })

  return {
    signInAsGuest: async () => toResult(await client.signIn.anonymous()),
    signInWithGoogle: async () =>
      toResult(await client.signIn.social({ provider: 'google', callbackURL: deps.callbackURL })),
    signOut: async () => toResult(await client.signOut()),
  }
}
