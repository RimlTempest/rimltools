/**
 * Better Auth の設定（ADR-0004）。組み立ては `@rimltools/auth/server` の共通実装
 * （plan 001 段階 3）。ここでは qrcc 固有の値だけを決める。
 * `basePath` とゲストのメールドメインは書かない（Better Auth の既定のまま。統合前と同じ）。
 */
import { buildAuthOptions as buildSharedAuthOptions } from '@rimltools/auth/server'
import type { AuthOptionsDeps } from '@rimltools/auth/server'

export type { AuthOptionsDeps, GoogleCredentials, LinkedAccounts } from '@rimltools/auth/server'
export { GUEST_DISPLAY_NAME, GUEST_SESSION_DAYS } from '@rimltools/auth/server'

export const buildAuthOptions = (deps: AuthOptionsDeps) =>
  buildSharedAuthOptions({ ...deps, appName: 'qrcc' })
