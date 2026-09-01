/**
 * 画面から見た「サインインの操作」。
 *
 * 実体（Better Auth のクライアント）は browser-auth-client.ts にあり、
 * ここには**型と文言**しか置かない。画面は操作を引数で受け取るので、
 * テストでは偽物を渡せる（関数DI）。
 */
import type { Result } from '@qrcc/contract'

export type AuthActionError =
  | { readonly kind: 'unavailable'; readonly detail: string }
  | { readonly kind: 'not_configured' }

export type AuthActionResult = Result<void, AuthActionError>

export type AuthActions = {
  readonly signInAsGuest: () => Promise<AuthActionResult>
  readonly signInWithGoogle: () => Promise<AuthActionResult>
  readonly signOut: () => Promise<AuthActionResult>
}

/** 失敗の理由を画面の文言にする。`kind` に UI 文言を混ぜないための変換点。 */
export const describeAuthActionError = (error: AuthActionError): string => {
  switch (error.kind) {
    case 'unavailable':
      return `サインインできませんでした（${error.detail}）。通信状況を確かめて、もう一度お試しください。`
    case 'not_configured':
      return 'Google でのサインインはこの環境では使えません。ゲストとして続けてください。'
  }
}
