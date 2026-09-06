/**
 * セッションから `Actor` を取り出す。
 *
 * ここが「Better Auth の型」と「noter のドメイン型」の境界。
 * ID は必ず `parseUserId` を通し、通らないものは visitor 扱いにする
 * （壊れた ID をそのまま noter-sync の actor に流さない / ADR-0002）。
 */
import { parseUserId } from '@noter/contract'
import type { Actor } from '../contract/actor.ts'
import { GUEST_DISPLAY_NAME } from './auth-options.ts'

/** Better Auth の `getSession` が返す形のうち、ここで使う部分だけ。 */
export type AuthSessionSnapshot = {
  readonly user: {
    readonly id: string
    readonly name: string
    readonly isAnonymous?: boolean | null | undefined
  }
  readonly session: { readonly expiresAt: Date }
}

const USER_FALLBACK_NAME = 'ログイン中'

export const toActor = (snapshot: AuthSessionSnapshot | null | undefined): Actor => {
  if (snapshot === null || snapshot === undefined) return { kind: 'visitor' }
  const userId = parseUserId(snapshot.user.id)
  if (!userId.ok) return { kind: 'visitor' }

  const name = snapshot.user.name.trim()
  return snapshot.user.isAnonymous === true
    ? {
        kind: 'guest',
        userId: userId.value,
        displayName: name === '' ? GUEST_DISPLAY_NAME : name,
        sessionExpiresAt: snapshot.session.expiresAt,
      }
    : {
        kind: 'user',
        userId: userId.value,
        displayName: name === '' ? USER_FALLBACK_NAME : name,
      }
}

export type GetSession = (headers: Headers) => Promise<AuthSessionSnapshot | null>

/**
 * リクエストの Cookie から `Actor` を作る。
 *
 * セッションの取得が失敗しても visitor として扱い、画面は出し続ける。
 * D1 が一時的に落ちているときに「ログイン画面すら開けない」状態を作らないため。
 */
export const makeCurrentActor =
  (getSession: GetSession) =>
  async (request: Request): Promise<Actor> => {
    try {
      return toActor(await getSession(request.headers))
    } catch {
      return { kind: 'visitor' }
    }
  }
