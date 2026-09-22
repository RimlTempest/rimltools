/**
 * 「いま誰が使っているか」（qrcc / noter 共通）。
 *
 * visitor（セッション無し）/ guest（匿名、期限付き）/ user（Google）の 3 つだけを区別する。
 * 何ができるか（qrcc の機能ごとのサインイン要否、noter の文書ごとの権限）は
 * プロダクトが決める。ここが答えるのは「誰か」と「検証済みの UserId」だけ。
 */
import type { UserId } from '@rimltools/contract'

export type Actor =
  /** セッションが無い。 */
  | { readonly kind: 'visitor' }
  /** ゲスト（匿名）。30 日でセッションごと消える。 */
  | {
      readonly kind: 'guest'
      readonly userId: UserId
      readonly displayName: string
      readonly sessionExpiresAt: Date
    }
  /** Google でサインイン済み。 */
  | { readonly kind: 'user'; readonly userId: UserId; readonly displayName: string }

export const isSignedIn = (actor: Actor): boolean => actor.kind !== 'visitor'

/**
 * 検証済みの `UserId`。`visitor` では `undefined`。
 * ここを通った値だけが、境界（qrcc-api / noter-sync）を越える actor として渡る（ADR-0002）。
 */
export const actorUserId = (actor: Actor): UserId | undefined =>
  actor.kind === 'visitor' ? undefined : actor.userId
