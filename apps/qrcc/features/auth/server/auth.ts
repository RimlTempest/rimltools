/**
 * 認証まわりの composition root（feature 内）。
 *
 * ここだけが Better Auth の実体を知っている。ルートや server function は
 * `Auth` の 2 つの関数しか触らない。D1 とドリズルのインスタンスは
 * アプリ側（services/web）から受け取る — feature が env を直接読まないため。
 */
import { betterAuth } from 'better-auth'
import type { DB } from '@better-auth/drizzle-adapter'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { RandomBytes } from '@qrcc/contract'
import type { Actor } from '../contract/actor.ts'
import { makePromoteGuestAccount } from '../core/promote-account.ts'
import type { GoogleCredentials } from './auth-options.ts'
import { buildAuthOptions } from './auth-options.ts'
import { makeCurrentActor } from './current-actor.ts'
import { makeHandleLinkAccount } from './link-account.ts'
import { makePromotionStore } from './promotion-store.ts'
import { authSchema } from './schema.ts'
import type { SqlRunner } from './sql.ts'

export type AuthDeps = {
  /** `drizzle(env.DB)` の結果。 */
  readonly db: DB
  /** 移譲用の生 SQL。`makeD1SqlRunner(env.DB)`。 */
  readonly sql: SqlRunner
  readonly baseURL: string
  readonly secret: string
  readonly google: GoogleCredentials | undefined
  readonly randomBytes: RandomBytes
  readonly now: () => Date
  readonly reportFailure: (detail: string) => void
}

export type Auth = {
  /** `/api/auth/*` を処理する。 */
  readonly handler: (request: Request) => Promise<Response>
  /** いま誰が使っているか。未ログインでも必ず `Actor` が返る。 */
  readonly currentActor: (request: Request) => Promise<Actor>
}

export const makeAuth = (deps: AuthDeps): Auth => {
  const store = makePromotionStore(deps.sql)
  const promote = makePromoteGuestAccount({
    findPromotion: store.findPromotion,
    transferOwnership: store.transferOwnership,
    now: deps.now,
  })

  const auth = betterAuth(
    buildAuthOptions({
      baseURL: deps.baseURL,
      secret: deps.secret,
      google: deps.google,
      randomBytes: deps.randomBytes,
      database: drizzleAdapter(deps.db, {
        provider: 'sqlite',
        schema: authSchema,
        // D1 に対話的トランザクションはない。逐次実行させる
        transaction: false,
      }),
      onLinkAccount: makeHandleLinkAccount({ promote, reportFailure: deps.reportFailure }),
    }),
  )

  return {
    handler: (request) => auth.handler(request),
    currentActor: makeCurrentActor(
      async (headers) => (await auth.api.getSession({ headers })) ?? null,
    ),
  }
}
