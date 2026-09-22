/**
 * ブラウザ側のサインイン操作（Better Auth のクライアント）。
 *
 * 画面はこのモジュールを import しない。ルート（composition root）が
 * 組み立てて `SignInScreen` に渡すので、画面はテストで偽物を受け取れる。
 * `Result` への変換と操作の共通部分は `@rimltools/auth/ui`（plan 001 段階 3）。
 */
import { createAuthClient } from 'better-auth/client'
import { anonymousClient } from 'better-auth/client/plugins'
import { makeBaseAuthActions } from '@rimltools/auth/ui'
import type { AuthActions } from './auth-actions.ts'

type BrowserAuthDeps = {
  /** サインイン後に戻る場所。 */
  readonly callbackURL: string
}

export const makeBrowserAuthActions = (deps: BrowserAuthDeps): AuthActions => {
  // baseURL は指定しない。表示中のオリジンをそのまま使う
  const client = createAuthClient({ plugins: [anonymousClient()] })
  return makeBaseAuthActions(client, deps)
}
