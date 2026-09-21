/**
 * 画面から見た「ログインの操作」。
 *
 * 実体（Better Auth のクライアント）は `browser-auth-client.ts` にあり、
 * ここには**型と文言**しか置かない。画面は操作を引数で受け取るので、
 * テストでは偽物を渡せる（関数DI）。
 */
import type { Result } from '@noter/contract'

export type AuthActionError =
  | { readonly kind: 'unavailable'; readonly detail: string }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'display_name_empty' }
  | { readonly kind: 'display_name_too_long'; readonly max: number }

export type AuthActionResult = Result<void, AuthActionError>

export type AuthActions = {
  readonly signInAsGuest: () => Promise<AuthActionResult>
  /** ゲストから呼ぶと昇格になる（文書はそのまま引き継がれる）。 */
  readonly signInWithGoogle: () => Promise<AuthActionResult>
  readonly signOut: () => Promise<AuthActionResult>
  readonly updateDisplayName: (displayName: string) => Promise<AuthActionResult>
}

/** 失敗の理由を画面の文言にする。`kind` に UI 文言を混ぜないための変換点。 */
export const describeAuthActionError = (error: AuthActionError): string => {
  switch (error.kind) {
    case 'unavailable':
      return `いまは処理できませんでした（${error.detail}）。通信状況を確かめて、もう一度お試しください。`
    case 'not_configured':
      return 'この環境では Google ログインを利用できません。ゲストのまま続けられます。'
    case 'display_name_empty':
      return '表示名を 1 文字以上入力してください。'
    case 'display_name_too_long':
      return `表示名は ${error.max} 文字以内で入力してください。`
  }
}
