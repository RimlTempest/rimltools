/**
 * ブラウザ側のログイン操作（Better Auth のクライアント）。
 *
 * 画面はこのモジュールを import しない。ルート（composition root）が
 * 組み立てて画面に渡すので、画面はテストで偽物を受け取れる。
 * `Result` への変換と操作の共通部分は `@rimltools/auth/ui`（plan 001 段階 3）。
 * 表示名の変更は noter だけの操作なので、ここで同じクライアントを使って足す。
 */
import { createAuthClient } from 'better-auth/client'
import { anonymousClient } from 'better-auth/client/plugins'
import { MAX_DISPLAY_NAME } from '@noter/contract'
import { makeBaseAuthActions, toAuthResult } from '@rimltools/auth/ui'
import type { AuthActions } from './auth-actions.ts'

type BrowserAuthDeps = {
  /** ログイン後に戻る場所。 */
  readonly callbackURL: string
}

export const makeBrowserAuthActions = (deps: BrowserAuthDeps): AuthActions => {
  // baseURL は指定しない。表示中のオリジンをそのまま使う
  const client = createAuthClient({ basePath: '/api/auth', plugins: [anonymousClient()] })

  return {
    ...makeBaseAuthActions(client, deps),
    updateDisplayName: async (displayName) => {
      const name = displayName.trim()
      if (name === '') return { ok: false, error: { kind: 'display_name_empty' } }
      // 画面の <input maxlength> と同じ数え方（UTF-16 コード単位）にそろえる
      if (name.length > MAX_DISPLAY_NAME) {
        return { ok: false, error: { kind: 'display_name_too_long', max: MAX_DISPLAY_NAME } }
      }
      return toAuthResult(await client.updateUser({ name }))
    },
  }
}
