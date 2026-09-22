/**
 * @noter/contract — noter の全レイヤが依存してよい共有型。
 *
 * プロダクト共通の型（Result・Brand・base32・検証済み文字列・ID の部品・UserId）は
 * `@rimltools/contract` の再 export。noter 固有の型だけをこのパッケージで定義する。
 *
 * ここには実装依存も I/O もない。時計・乱数・ネットワークが要るものは
 * 引数として受け取る形（例: `RandomBytes`）でのみ表現する。
 */
export { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from '@rimltools/contract'
export type { Brand } from '@rimltools/contract'
export { makeParser } from '@rimltools/contract'
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
export type { Err, Ok, Result } from '@rimltools/contract'
export { collectResults, err, flatMapResult, isErr, isOk, mapResult, ok } from '@rimltools/contract'
export type {
  EmailAddress,
  HexColor,
  HttpUrl,
  NonEmptyText,
  PhoneNumber,
  TextParseError,
} from '@rimltools/contract'
export {
  parseEmailAddress,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
} from '@rimltools/contract'
