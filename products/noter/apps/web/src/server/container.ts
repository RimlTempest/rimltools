/**
 * Composition root。ここだけが具体実装と env を知っている。
 *
 * ルートや server function は `Container` の関数を受け取るだけで、
 * `env` や service binding を直接触らない（.claude/skills/noter-architecture）。
 *
 * D1 バインディングを Drizzle に渡す配線をここに置くのは、`D1Database` の
 * グローバル型が apps/web のプログラムでしか解決できないため。
 */
import { drizzle } from 'drizzle-orm/d1'
import type { Actor } from '@noter/auth/contract'
import type { Auth } from '@noter/auth/server'
import { isGoogleConfigured, makeAuthFromEnv, makeD1SqlRunner } from '@noter/auth/server'

/**
 * ここで使う env の形だけ。秘密情報は `readEnvString` が `unknown` から読む。
 *
 * D1 バインディングの型は `drizzle` の引数から取る。アンビエントな
 * `D1Database` を直接書くと、生成物（`worker-configuration.d.ts`）を
 * 読まないツール（oxlint）から解決できない。
 */
type D1Binding = Parameters<typeof drizzle>[0]

export type WebEnv = {
  readonly DB?: D1Binding
}

export type Container = {
  /**
   * `/api/auth/*` のハンドラ。D1 が無い環境（設定ミス）では `undefined` になり、
   * 認証のエンドポイントだけが使えなくなる。画面は visitor のまま出す。
   */
  readonly auth: Auth | undefined
  /** いま誰が使っているか。失敗しても必ず `Actor` が返る。 */
  readonly currentActor: (request: Request) => Promise<Actor>
  /** Google の資格情報がそろっているか。UI はこれが false ならボタンを出さない。 */
  readonly isGoogleAvailable: boolean
}

const visitorOnly = async (): Promise<Actor> => ({ kind: 'visitor' })

/**
 * TODO(plan 004): 文書リポジトリと、昇格時の `transfer`（document / document_member の
 * 付け替え）をここで組み立てて `makeAuthFromEnv` に渡す。
 */
export const makeContainer = (env: WebEnv, request: Request): Container => {
  const database = env.DB
  const auth =
    database === undefined
      ? undefined
      : makeAuthFromEnv(env, {
          makeDb: () => drizzle(database),
          sql: makeD1SqlRunner(database),
          requestOrigin: new URL(request.url).origin,
        })

  return {
    auth,
    currentActor: auth?.currentActor ?? visitorOnly,
    isGoogleAvailable: isGoogleConfigured(env),
  }
}
