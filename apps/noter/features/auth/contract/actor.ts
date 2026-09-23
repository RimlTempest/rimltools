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
import type { Actor } from '@rimltools/auth/contract'

// `Actor` の型と `isSignedIn` / `actorUserId` は `@rimltools/auth/contract`（plan 001 段階 3）。
// `actorUserId` を通った値だけが「検証済みの actorId」として noter-sync へ渡る（ADR-0002）。
export type { Actor } from '@rimltools/auth/contract'
export { actorUserId, isSignedIn } from '@rimltools/auth/contract'

/** ヘッダーや参加者一覧に出す名前。visitor には名前が無い。 */
export const actorDisplayName = (actor: Actor): string | undefined =>
  actor.kind === 'visitor' ? undefined : actor.displayName
