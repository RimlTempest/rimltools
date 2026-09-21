/**
 * @rimltools/contract — 全プロダクトの全レイヤが依存してよい共有型。
 *
 * ここには実装依存も I/O もない。時計・乱数・ネットワークが要るものは
 * 引数として受け取る形（例: `RandomBytes`）でのみ表現する。
 * プロダクト固有の型は各プロダクトの `@<tool>/contract` が、これを再 export したうえで足す。
 */
export { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
export type { Brand } from './brand.ts'
export { makeParser } from './brand.ts'
export type { IdParseError, RandomBytes, UserId } from './id.ts'
export {
  ID_BODY_LENGTH,
  hasPrefixedShape,
  issuePrefixed,
  newUserId,
  parseUserId,
  prefixedIdParser,
  previewReceived,
} from './id.ts'
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
