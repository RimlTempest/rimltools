/**
 * 「いま誰が noter を使っているか」（ADR-0010）。
 *
 * noter は**共有リンクを開いた人がサインインなしで即座に編集に参加できる**ことを
 * 前提にしている。そのため「まだ誰でもない人（visitor）」は一瞬しか存在せず、
 * 文書に触れる時点では必ずゲストか Google ユーザーになっている。
 *
 * 文書ごとの権限（owner / editor / viewer）はここでは扱わない。
 * それは `document_member` の役割であり、判定は `can(role, action)` 1 枚に
 * 集約する（ADR-0011）。ここが答えるのは「所有者になれる人か」だけ。
 */
import type { UserId } from '@noter/contract'

export type Actor =
  /** セッションが無い。文書を作ることも開くこともできない。 */
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
 * 検証済みの `UserId`。`visitor` には無い。
 *
 * ここを通った値だけが「検証済みの actorId」として noter-sync へ渡る
 * （ADR-0002）。`exactOptionalPropertyTypes` なので、呼び出し側は
 * `undefined` を「キーごと無い」として扱うことになる。
 */
export const actorUserId = (actor: Actor): UserId | undefined =>
  actor.kind === 'visitor' ? undefined : actor.userId

/** ヘッダーや参加者一覧に出す名前。visitor には名前が無い。 */
export const actorDisplayName = (actor: Actor): string | undefined =>
  actor.kind === 'visitor' ? undefined : actor.displayName
