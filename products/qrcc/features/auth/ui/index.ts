/**
 * @qrcc/auth の UI。サインイン画面と、ヘッダーなどに置く状態表示。
 *
 * どちらも認証の実体（Better Auth）を知らない。操作は引数で受け取るので、
 * テストでは偽物を渡せる。
 */
export type { AuthActionError, AuthActionResult, AuthActions } from './auth-actions.ts'
export { describeAuthActionError } from './auth-actions.ts'
export type { SignInLinkRenderer } from './auth-status.tsx'
export { AuthStatus } from './auth-status.tsx'
export { GUEST_SESSION_DAYS } from './guest-guide.ts'
export { SignInScreen } from './sign-in-screen.tsx'
