/**
 * Better Auth の設定（ADR-0004）。
 *
 * 設定そのものがセキュリティの決め事なので、`betterAuth()` に渡す前の
 * **素のオブジェクトを組み立てる関数**として切り出し、テストで固定する。
 * D1 も乱数もここでは作らない（すべて引数で受け取る）。
 */
import type { BetterAuthOptions } from 'better-auth'
import { anonymous } from 'better-auth/plugins'
import type { RandomBytes } from '@qrcc/contract'
import { encodeCrockfordBase32, newUserId } from '@qrcc/contract'

/**
 * セッションの有効期限（日）。ゲストのデータはここを過ぎると Cron が消す。
 * Google でサインインしても同じ長さで運用する（更新のたびに延びる）。
 */
export const GUEST_SESSION_DAYS = 30

/** ゲストの表示名。画面の既定値（`toActor`）と合わせる。 */
export const GUEST_DISPLAY_NAME = 'ゲスト'

const DAY_SECONDS = 24 * 60 * 60
/** ID 本体 24 文字ぶんの乱数（5bit/文字 → 15 バイト）。 */
const ID_RANDOM_BYTES = 15

export type GoogleCredentials = {
  readonly clientId: string
  readonly clientSecret: string
}

export type LinkedAccounts = {
  readonly anonymousUser: { readonly user: { readonly id: string } }
  readonly newUser: { readonly user: { readonly id: string } }
}

export type AuthOptionsDeps = {
  /** 公開オリジン。Google のリダイレクト先の基準になる。 */
  readonly baseURL: string
  readonly secret: string
  /** 未設定なら Google の経路を出さない（ローカル開発で秘密情報なしでも動かすため）。 */
  readonly google: GoogleCredentials | undefined
  readonly database: BetterAuthOptions['database']
  readonly randomBytes: RandomBytes
  /** ゲストが Google で続けたときに呼ばれる。移譲はここから走る。 */
  readonly onLinkAccount: (linked: LinkedAccounts) => Promise<void>
}

/**
 * ID の発行。`user.id` は qrcc の `UserId`（`usr_` + Crockford base32 24 文字）に
 * そろえる。こうしておくと、セッションから取り出した ID がそのまま
 * 検証済み `UserId` として qrcc-api に渡せる（ADR-0002）。
 */
const makeGenerateId =
  (randomBytes: RandomBytes) =>
  ({ model }: { readonly model: string }): string => {
    if (model === 'user') {
      const id = newUserId(randomBytes)
      // パース失敗はエンコーダの不具合。ここで握りつぶすと壊れた ID が保存される
      if (!id.ok) throw new Error(`UserId を発行できなかった: ${id.error.expected}`)
      return id.value
    }
    return encodeCrockfordBase32(randomBytes(ID_RANDOM_BYTES))
  }

export const buildAuthOptions = (deps: AuthOptionsDeps) =>
  ({
    appName: 'qrcc',
    baseURL: deps.baseURL,
    // リダイレクト先は自分のオリジンだけ信頼する（オープンリダイレクト対策）
    trustedOrigins: [deps.baseURL],
    secret: deps.secret,
    database: deps.database,
    // パスワードは使わない。覚えさせない・パズルを課さないことが要件（AAA 3.3.9）
    emailAndPassword: { enabled: false },
    socialProviders:
      deps.google === undefined
        ? {}
        : {
            google: {
              clientId: deps.google.clientId,
              clientSecret: deps.google.clientSecret,
              // 端末を共有している人が別アカウントを選べるようにする
              prompt: 'select_account',
            },
          },
    session: {
      expiresIn: GUEST_SESSION_DAYS * DAY_SECONDS,
      updateAge: DAY_SECONDS,
      // cookieCache は**使わない**。secondaryStorage を併用したときの
      // フォールバック不具合を避けるため（ADR-0004）。既定で無効なので
      // 「書かない」ことが設定であり、テストで固定する
    },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        // Google からのリダイレクトで Cookie が落ちない最小の強さ
        sameSite: 'lax',
        path: '/',
      },
      database: { generateId: makeGenerateId(deps.randomBytes) },
    },
    plugins: [
      anonymous({
        // 既定は 'Anonymous'。画面に出たときに意味が通る名前にしておく
        generateName: () => GUEST_DISPLAY_NAME,
        onLinkAccount: deps.onLinkAccount,
      }),
    ],
  }) satisfies BetterAuthOptions
