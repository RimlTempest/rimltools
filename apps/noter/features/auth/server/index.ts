/**
 * @noter/auth のサーバ側。noter-web の Worker でだけ動く。
 */
export type { Auth, AuthDeps } from './auth.ts'
export { makeAuth } from './auth.ts'
export type { AuthOptionsDeps, GoogleCredentials, LinkedAccounts } from './auth-options.ts'
export {
  GUEST_DISPLAY_NAME,
  GUEST_EMAIL_DOMAIN,
  GUEST_SESSION_DAYS,
  buildAuthOptions,
} from './auth-options.ts'
export type { AuthSessionSnapshot, GetSession } from './current-actor.ts'
export { makeCurrentActor, toActor } from './current-actor.ts'
export type { AuthFromEnvDeps } from './from-env.ts'
export {
  isGoogleConfigured,
  makeAuthFromEnv,
  readEnvString,
  readLegacyOrigins,
  resolveBaseURL,
} from './from-env.ts'
export type { HandleLinkAccountDeps } from './link-account.ts'
export { makeHandleLinkAccount } from './link-account.ts'
export type { PromotionStore } from './promotion-store.ts'
export { makePromotionStore } from './promotion-store.ts'
export { account, authSchema, session, user, verification } from './schema.ts'
export type { SqlError, SqlRow, SqlRunner, SqlStatement, SqlValue } from './sql.ts'
export { makeD1SqlRunner } from './sql.ts'
