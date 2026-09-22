/**
 * Better Auth の設定（ADR-0004）。組み立ては `@rimltools/auth/server` の共通実装
 * （plan 001 段階 3）。ここでは qrcc 固有の値だけを決める。
 *
 * - `anonymous` プラグインは qrcc が固定している better-auth の版のものを渡す
 * - `basePath` とゲストのメールドメインは書かない（Better Auth の既定のまま。統合前と同じ）
 */
import { anonymous } from 'better-auth/plugins'
import { buildAuthOptions as buildSharedAuthOptions } from '@rimltools/auth/server'
import type { BetterAuthOptions } from 'better-auth'
import type { AuthOptionsDeps as SharedAuthOptionsDeps } from '@rimltools/auth/server'

export type { GoogleCredentials, LinkedAccounts } from '@rimltools/auth/server'

/** データベースのアダプタの型は、この製品が固定している better-auth の版のもの。 */
export type AuthOptionsDeps = SharedAuthOptionsDeps<BetterAuthOptions['database']>
export { GUEST_DISPLAY_NAME, GUEST_SESSION_DAYS } from '@rimltools/auth/server'

export const buildAuthOptions = (deps: AuthOptionsDeps) =>
  buildSharedAuthOptions({ ...deps, appName: 'qrcc', anonymous }) satisfies BetterAuthOptions
