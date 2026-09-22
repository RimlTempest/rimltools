/**
 * ブラウザ側のサインイン操作の共通部分（Better Auth のクライアント → `Result`）。
 *
 * クライアントは `createBrowserAuthClient` で作り、操作は `makeBaseAuthActions` が受け取る
 * （テストでは偽物のクライアントを渡す）。プロダクト固有の操作（noter の表示名変更など）は、
 * プロダクトが同じクライアントで足す。
 */
import { createAuthClient } from 'better-auth/client'
import { anonymousClient } from 'better-auth/client/plugins'
import type { Result } from '@rimltools/contract'

export type BaseAuthError = { readonly kind: 'unavailable'; readonly detail: string }

export type BaseAuthResult = Result<void, BaseAuthError>

/** Better Auth のクライアントの戻り値のうち、ここで使う部分だけ。 */
type ClientOutcome = { readonly error?: unknown }

/**
 * Better Auth のクライアントのうち、ここで使う部分だけの形。
 * **メソッド記法で書く。** アロー記法だと引数が反変になり、実物のクライアントを渡せなくなる。
 */
export type AuthClientLike = {
  readonly signIn: {
    anonymous(): Promise<ClientOutcome>
    social(options: { provider: 'google'; callbackURL: string }): Promise<ClientOutcome>
  }
  signOut(): Promise<ClientOutcome>
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
export const toAuthResult = (outcome: ClientOutcome): BaseAuthResult =>
  outcome.error === null || outcome.error === undefined
    ? { ok: true, value: undefined }
    : { ok: false, error: { kind: 'unavailable', detail: readMessage(outcome.error) } }

export type BaseAuthActions = {
  readonly signInAsGuest: () => Promise<BaseAuthResult>
  readonly signInWithGoogle: () => Promise<BaseAuthResult>
  readonly signOut: () => Promise<BaseAuthResult>
}

export const makeBaseAuthActions = (
  client: AuthClientLike,
  deps: { readonly callbackURL: string },
): BaseAuthActions => ({
  signInAsGuest: async () => toAuthResult(await client.signIn.anonymous()),
  signInWithGoogle: async () =>
    toAuthResult(await client.signIn.social({ provider: 'google', callbackURL: deps.callbackURL })),
  signOut: async () => toAuthResult(await client.signOut()),
})

/**
 * Better Auth のブラウザ側クライアント（ゲスト用の anonymous プラグイン付き）。
 * baseURL は指定しない。表示中のオリジンをそのまま使う。
 */
export const createBrowserAuthClient = (options: { readonly basePath?: string } = {}) =>
  createAuthClient({
    ...(options.basePath === undefined ? {} : { basePath: options.basePath }),
    plugins: [anonymousClient()],
  })
