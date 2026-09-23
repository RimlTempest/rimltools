/**
 * Worker の env から `Auth` を組み立てる。
 *
 * D1 バインディングを Drizzle に渡す部分だけは **アプリ側（`*.route.tsx`）**に
 * 残す。`drizzle-orm/d1` の型はグローバルの `D1Database` に依存していて、
 * feature 単体の TypeScript プログラムでは解決できないため、
 * 「作り方」を関数で受け取る形にしている。
 */
import type { DB } from '@better-auth/drizzle-adapter'
import type { RandomBytes } from '@qrcc/contract'
import { resolvePublicOriginFromEnv } from '@qrcc/contract'
import type { Auth } from './auth.ts'
import { makeAuth } from './auth.ts'
import { readEnvString } from './api-actor.ts'
import type { SqlRunner } from './sql.ts'

export type AuthFromEnvDeps = {
  /** `() => drizzle(env.DB)`。 */
  readonly makeDb: () => DB
  /** `makeD1SqlRunner(env.DB)`。 */
  readonly sql: SqlRunner
  /** リクエストのオリジン。ローカルと本番で Google のリダイレクト先を分けるため。 */
  readonly origin: string
  readonly now?: () => Date
  readonly randomBytes?: RandomBytes
  readonly reportFailure?: (detail: string) => void
}

const browserRandomBytes: RandomBytes = (byteLength) =>
  crypto.getRandomValues(new Uint8Array(byteLength))

/** Google の資格情報がそろっているか。ローカルではゲストだけで動かせる。 */
export const isGoogleConfigured = (env: unknown): boolean =>
  readEnvString(env, 'GOOGLE_CLIENT_ID') !== '' && readEnvString(env, 'GOOGLE_CLIENT_SECRET') !== ''

/**
 * Better Auth の `baseURL`（Cookie のスコープと Google のリダイレクト先）。
 * portless の dev では、プロキシの後ろの Worker は http を受けるので、ブラウザが見ている
 * https のオリジン（`DEV_PUBLIC_ORIGIN`、`.localhost` に限る）を使う（docs/local-dev.md）。
 */
export const authBaseURL = (env: unknown, requestOrigin: string): string =>
  resolvePublicOriginFromEnv(env, requestOrigin)

export const makeAuthFromEnv = (env: unknown, deps: AuthFromEnvDeps): Auth =>
  makeAuth({
    db: deps.makeDb(),
    sql: deps.sql,
    baseURL: authBaseURL(env, deps.origin),
    secret: readEnvString(env, 'BETTER_AUTH_SECRET'),
    google: isGoogleConfigured(env)
      ? {
          clientId: readEnvString(env, 'GOOGLE_CLIENT_ID'),
          clientSecret: readEnvString(env, 'GOOGLE_CLIENT_SECRET'),
        }
      : undefined,
    randomBytes: deps.randomBytes ?? browserRandomBytes,
    now: deps.now ?? (() => new Date()),
    reportFailure:
      deps.reportFailure
      ?? ((detail) => {
        // 移譲の失敗はサインインを止めない。運用で気づけるように残す
        console.error(`[qrcc-auth] ${detail}`)
      }),
  })
