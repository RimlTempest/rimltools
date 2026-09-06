/**
 * @noter/documents のドメインロジック。I/O は持たず、すべて引数で受け取る。
 */
export type { Action, MemberRow, OwnedDocument } from './permission.ts'
export { ACTIONS, can, roleForActor } from './permission.ts'
export { resolveJoinedRole } from './join.ts'
export type { ShareLinkUnusable } from './share-link.ts'
export {
  SHARE_LINK_DAY_CHOICES,
  defaultExpiry,
  expiryFromDays,
  isShareLinkUsable,
} from './share-link.ts'
export type { TitleError } from './title.ts'
export { DEFAULT_TITLE, normalizeTitle } from './title.ts'
