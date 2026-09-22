/**
 * Better Auth の設定（ADR-0010）。組み立ては `@rimltools/auth/server` の共通実装
 * （plan 001 段階 3）。ここでは noter 固有の値だけを決める。
 *
 * - `anonymous` プラグインは noter が固定している better-auth の版のものを渡す
 * - `basePath` を明示し、ゲストには実在しないメールドメインを割り当てる（統合前と同じ）
 */
import { anonymous } from 'better-auth/plugins'
import { buildAuthOptions as buildSharedAuthOptions } from '@rimltools/auth/server'
import type { BetterAuthOptions } from 'better-auth'
import type { AuthOptionsDeps as SharedAuthOptionsDeps } from '@rimltools/auth/server'

export type { GoogleCredentials, LinkedAccounts } from '@rimltools/auth/server'

/** データベースのアダプタの型は、この製品が固定している better-auth の版のもの。 */
export type AuthOptionsDeps = SharedAuthOptionsDeps<BetterAuthOptions['database']>
export { GUEST_DISPLAY_NAME, GUEST_SESSION_DAYS } from '@rimltools/auth/server'

/**
 * ゲストに割り当てるメールアドレスのドメイン。
 * 実在しない TLD を使い、間違って送信先になっても外へ出ないようにする。
 */
export const GUEST_EMAIL_DOMAIN = 'guest.noter.invalid'

export const buildAuthOptions = (deps: AuthOptionsDeps) =>
  buildSharedAuthOptions({
    ...deps,
    appName: 'noter',
    basePath: '/api/auth',
    guestEmailDomain: GUEST_EMAIL_DOMAIN,
    anonymous,
  }) satisfies BetterAuthOptions
