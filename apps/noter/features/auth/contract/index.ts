/**
 * @noter/auth の契約。
 *
 * 「誰が使っているか」と「その人が共有リンクに載せられる権限」だけを置く。
 * 実装（Better Auth・D1）には依存しない。
 */
export type { Actor } from './actor.ts'
export { actorDisplayName, actorUserId, isSignedIn } from './actor.ts'
export type { ActorWire } from './actor-wire.ts'
export { parseActorWire, toActorWire } from './actor-wire.ts'
export type { ShareRole, ShareRoleDenied } from './share-policy.ts'
export {
  SHARE_ROLES,
  allowedShareRoles,
  canGrantShareRole,
  describeShareRoleDenial,
  shareRoleDenial,
} from './share-policy.ts'
