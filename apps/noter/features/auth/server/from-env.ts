/**
 * Worker の env から `Auth` を組み立てる。
 *
 * D1 バインディングを Drizzle に渡す部分だけは **アプリ側**に残す。
 * `drizzle-orm/d1` の型はグローバルの `D1Database` に依存していて、
 * feature 単体の TypeScript プログラムでは解決できないため、
 * 「作り方」を関数で受け取る形にしている。
 */
import type { DB } from '@better-auth/drizzle-adapter'
import type { RandomBytes, Result, UserId } from '@noter/contract'
import { ok } from '@noter/contract'
import type { PromotionIoError } from '../core/promote-account.ts'
import type { Auth } from './auth.ts'
import { makeAuth } from './auth.ts'
import type { SqlRunner } from './sql.ts'

/**
 * Worker の env から文字列を読む。
 *
 * 秘密情報は Wrangler secret なので `wrangler types` の生成する型には
 * 現れない。未設定でも落とさず、空文字として扱えるようにする
 * （ローカルではゲストログインだけで動かせる）。
 */
export const readEnvString = (env: unknown, key: string): string => {
  if (typeof env !== 'object' || env === null) return ''
  const value: unknown = Reflect.get(env, key)
  return typeof value === 'string' ? value : ''
}

/** Google の資格情報がそろっているか。未設定の環境では Google ボタンを出さない。 */
export const isGoogleConfigured = (env: unknown): boolean =>
  readEnvString(env, 'GOOGLE_CLIENT_ID') !== '' && readEnvString(env, 'GOOGLE_CLIENT_SECRET') !== ''

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const isLoopback = (origin: string): boolean => {
  if (!URL.canParse(origin)) return false
  return LOOPBACK_HOSTS.has(new URL(origin).hostname)
}

/**
 * Better Auth の `baseURL`。Cookie のスコープと Google のリダイレクト先を決める。
 *
 * 本番は `env.APP_ORIGIN` に固定する（Host ヘッダを信用しない）。
 * ローカル（ループバック）だけは、`wrangler.jsonc` の `vars` に入っている
 * 本番オリジンではなく、実際に開いているオリジンを使う。そうしないと
 * `trustedOrigins` に localhost が入らず、手元のブラウザからログインできない。
 */
export const resolveBaseURL = (
  appOrigin: string,
  requestOrigin: string,
  legacyOrigins: readonly string[] = [],
): string =>
  appOrigin === '' || isLoopback(requestOrigin) || legacyOrigins.includes(requestOrigin)
    ? requestOrigin
    : appOrigin

/**
 * ドメイン移行中（旧 `noter.riml4i.com` → 新 `noter.tools.riml4i.com`）に、旧ホストで
 * 開かれてもログインが成立するよう、明示的に許可した旧オリジンだけを受け付ける。
 * `APP_LEGACY_ORIGINS` はカンマ区切り。値はリリーススクリプトが tools.json の
 * legacyHosts から入れる（ルートの docs/release.md）。https 以外と不正な値は捨てる。
 */
export const readLegacyOrigins = (env: unknown): string[] =>
  readEnvString(env, 'APP_LEGACY_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => URL.canParse(value) && new URL(value).protocol === 'https:')
    .map((value) => new URL(value).origin)

export type AuthFromEnvDeps = {
  /** `() => drizzle(env.DB)`。 */
  readonly makeDb: () => DB
  /** `makeD1SqlRunner(env.DB)`。 */
  readonly sql: SqlRunner
  /** リクエストのオリジン。ローカルと本番でリダイレクト先を分けるため。 */
  readonly requestOrigin: string
  /** 文書とメンバーの移譲。既定は何もしない（plan 004 が差し替える）。 */
  readonly transfer?: (
    fromUserId: UserId,
    toUserId: UserId,
  ) => Promise<Result<void, PromotionIoError>>
  readonly randomBytes?: RandomBytes
  readonly reportFailure?: (detail: string) => void
}

const workerRandomBytes: RandomBytes = (byteLength) =>
  crypto.getRandomValues(new Uint8Array(byteLength))

/** plan 004 が文書テーブルを作るまでは移すものが無い。 */
const noTransfer = async (): Promise<Result<void, PromotionIoError>> => ok(undefined)

export const makeAuthFromEnv = (env: unknown, deps: AuthFromEnvDeps): Auth =>
  makeAuth({
    db: deps.makeDb(),
    sql: deps.sql,
    baseURL: resolveBaseURL(
      readEnvString(env, 'APP_ORIGIN'),
      deps.requestOrigin,
      readLegacyOrigins(env),
    ),
    secret: readEnvString(env, 'BETTER_AUTH_SECRET'),
    google: isGoogleConfigured(env)
      ? {
          clientId: readEnvString(env, 'GOOGLE_CLIENT_ID'),
          clientSecret: readEnvString(env, 'GOOGLE_CLIENT_SECRET'),
        }
      : undefined,
    randomBytes: deps.randomBytes ?? workerRandomBytes,
    transfer: deps.transfer ?? noTransfer,
    reportFailure:
      deps.reportFailure
      ?? ((detail) => {
        // 移譲の失敗はログインを止めない。運用で気づけるように残す
        console.error(`[noter-auth] ${detail}`)
      }),
  })
