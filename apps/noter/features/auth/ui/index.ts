/**
 * @noter/auth の UI。ログイン画面・アカウント設定・ヘッダーの状態表示。
 *
 * どれも認証の実体（Better Auth）を知らない。操作は引数で受け取るので、
 * テストでは偽物を渡せる。
 */
export { AccountSettingsScreen } from './account-settings-screen.tsx'
export type { AuthActionError, AuthActionResult, AuthActions } from './auth-actions.ts'
export { describeAuthActionError } from './auth-actions.ts'
export type { AuthLinkRenderer } from './auth-status.tsx'
export { AuthStatus } from './auth-status.tsx'
export { makeBrowserAuthActions } from './browser-auth-client.ts'
export { GUEST_SESSION_DAYS } from './guest-guide.ts'
export { SignInScreen } from './sign-in-screen.tsx'
