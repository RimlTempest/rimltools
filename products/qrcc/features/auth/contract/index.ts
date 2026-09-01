/**
 * @qrcc/auth の契約。
 *
 * 「誰が使っているか」と「その人に何が許されるか」だけを置く。
 * 実装（Better Auth・D1）には依存しない。
 */
export type { Actor, Capability } from './actor.ts'
export { CAPABILITIES, actorUserId, canUse, isSignedIn } from './actor.ts'
export type {
  ShareExpiry,
  ShareLinkDenied,
  ShareLinkGrant,
  ShareLinkRequest,
  SharePermission,
} from './share-policy.ts'
export {
  MAX_SHARE_DAYS,
  SHARE_DAYS_DEFAULT,
  authorizeShareLink,
  describeShareDenial,
} from './share-policy.ts'
