/**
 * セッションから `Actor` を取り出す（qrcc / noter 共通）。
 *
 * ここが「Better Auth の型」と「プロダクトのドメイン型」の境界。
 * ID は必ず `parseUserId` を通し、通らないものは visitor として扱う
 * （壊れた ID を内部の Worker の actor に流さない / ADR-0002）。
 */
import { parseUserId } from '@rimltools/contract'
import type { Actor } from '../contract/actor.ts'

/** Better Auth の `getSession` が返す形のうち、ここで使う部分だけ。 */
export type AuthSessionSnapshot = {
  readonly user: {
    readonly id: string
    readonly name: string
    readonly isAnonymous?: boolean | null | undefined
  }
  readonly session: { readonly expiresAt: Date }
}

export type ToActor = (snapshot: AuthSessionSnapshot | null | undefined) => Actor

export type ActorNames = {
  /** 名前が空のゲストに出す名前。 */
  readonly guestDisplayName: string
  /** 名前が空の Google ユーザーに出す名前（プロダクトの言葉づかい）。 */
  readonly userFallbackName: string
}

export const makeToActor =
  (names: ActorNames): ToActor =>
  (snapshot) => {
    if (snapshot === null || snapshot === undefined) return { kind: 'visitor' }
    const userId = parseUserId(snapshot.user.id)
    if (!userId.ok) return { kind: 'visitor' }

    const name = snapshot.user.name.trim()
    return snapshot.user.isAnonymous === true
      ? {
          kind: 'guest',
          userId: userId.value,
          displayName: name === '' ? names.guestDisplayName : name,
          sessionExpiresAt: snapshot.session.expiresAt,
        }
      : {
          kind: 'user',
          userId: userId.value,
          displayName: name === '' ? names.userFallbackName : name,
        }
  }

export type GetSession = (headers: Headers) => Promise<AuthSessionSnapshot | null>

/**
 * リクエストの Cookie から `Actor` を作る。
 * セッションの取得が失敗しても visitor として扱い、画面は出し続ける
 * （D1 が一時的に落ちているときに「サインイン画面すら開けない」状態を作らないため）。
 */
export const makeCurrentActor =
  (toActor: ToActor, getSession: GetSession) =>
  async (request: Request): Promise<Actor> => {
    try {
      return toActor(await getSession(request.headers))
    } catch {
      return { kind: 'visitor' }
    }
  }
