/**
 * qrcc-api を呼ぶときの `actor`（ADR-0002）と、環境変数の読み出し。
 *
 * `apps/web/src/server/api-client.ts` の `CallOptions.actor` は
 * **検証済みの `UserId`** しか受け取らない。未ログインではキーごと落とす
 * （`exactOptionalPropertyTypes` なので `undefined` を入れられない）。
 *
 * @example
 * const outcome = await client.call('codes.list', body, decode, apiActorOptions(actor))
 */
import type { UserId } from '@qrcc/contract'
import type { Actor } from '../contract/actor.ts'
import { actorUserId } from '../contract/actor.ts'

export const apiActorOptions = (actor: Actor): { readonly actor?: UserId } => {
  const userId = actorUserId(actor)
  return userId === undefined ? {} : { actor: userId }
}

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
