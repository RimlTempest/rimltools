/**
 * @noter/contract — 全レイヤが依存してよい唯一の共有型。
 *
 * ここには実装依存も I/O もない。時計・乱数・ネットワークが要るものは
 * 引数として受け取る形（例: `RandomBytes`）でのみ表現する。
 */
export { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
export type { Brand } from './brand.ts'
export { makeParser } from './brand.ts'
export type { DocumentKind, DocumentKindParseError } from './document-kind.ts'
export { DOCUMENT_KINDS, FILE_EXTENSION, MIME_TYPE, parseDocumentKind } from './document-kind.ts'
export type { DocumentId, IdParseError, RandomBytes, ShareToken, UserId } from './id.ts'
export {
  newDocumentId,
  newShareToken,
  newUserId,
  parseDocumentId,
  parseShareToken,
  parseUserId,
} from './id.ts'
export {
  MAX_DISPLAY_NAME,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_USER,
  MAX_MEMBERS,
  MAX_TITLE_LENGTH,
  MAX_WS_MESSAGE_BYTES,
  SHARE_LINK_MAX_AGE_MS,
} from './limits.ts'
export type { Role, RoleParseError } from './role.ts'
export { ROLES, higherRole, parseRole } from './role.ts'
export type { Err, Ok, Result } from './result.ts'
export { collectResults, err, flatMapResult, isErr, isOk, mapResult, ok } from './result.ts'
export type {
  EmailAddress,
  HexColor,
  HttpUrl,
  NonEmptyText,
  PhoneNumber,
  TextParseError,
} from './text.ts'
export {
  parseEmailAddress,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
} from './text.ts'
