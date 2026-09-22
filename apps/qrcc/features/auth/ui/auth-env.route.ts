/**
 * 環境から「いまの呼び出し元」を取り出す。
 *
 * Cookie は HttpOnly なのでブラウザからは読めない。判定は必ずサーバで行い、
 * 画面には検証済みの値だけを渡す。複数のルートがこの判定を要るので、
 * 手順をここに 1 つだけ置いて写し間違いを防ぐ。
 *
 * `D1Database` の型は Workers ランタイムが供給するもので、feature 単体の
 * TypeScript プログラムでは解決できない。`*.route.*` はアプリ側の配線として
 * services/web のプログラムに属するので、ここに置くと素直に型が付く。
 */
import { drizzle } from 'drizzle-orm/d1'
import type { ActorWire } from '@qrcc/auth/contract'
import { toActorWire } from '@qrcc/auth/contract'
import { makeAuthFromEnv } from '../server/from-env.ts'
import { makeD1SqlRunner } from '../server/sql.ts'

export const currentActorWire = async (
  env: { readonly DB?: D1Database },
  request: Request,
): Promise<ActorWire> => {
  const database = env.DB
  if (database === undefined) {
    // D1 が無い環境でも画面は出す（生成と読み取りはサインイン不要）
    return { kind: 'visitor' }
  }
  const auth = makeAuthFromEnv(env, {
    makeDb: () => drizzle(database),
    sql: makeD1SqlRunner(database),
    origin: new URL(request.url).origin,
  })
  return toActorWire(await auth.currentActor(request))
}
