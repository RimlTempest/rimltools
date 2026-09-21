/**
 * セッションから `Actor` を取り出す。
 *
 * ここが「Better Auth の型」と「qrcc のドメイン型」の境界。
 * ID は必ず `parseUserId` を通し、通らないものは未ログイン扱いにする
 * （壊れた ID をそのまま qrcc-api の actor に流さない / ADR-0002）。
 */
import { parseUserId } from '@qrcc/contract'
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

const USER_FALLBACK_NAME = 'サインイン中'

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
 * セッションの取得が失敗しても未ログインとして扱い、画面は動かし続ける
 * （生成と読み取りはサインインなしで使えることが要件 / ADR-0004）。
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
