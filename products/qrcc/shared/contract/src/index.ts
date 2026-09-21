/**
 * @qrcc/contract — 全レイヤが依存してよい唯一の共有型。
 *
 * ここには実装依存も I/O もない。時計・乱数・ネットワークが要るものは
 * 引数として受け取る形（例: `RandomBytes`）でのみ表現する。
 */
export { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
export type { Brand } from './brand.ts'
export { makeParser } from './brand.ts'
export type {
  CodeId,
  FolderId,
  IdParseError,
  RandomBytes,
  ShareToken,
  SpecHash,
  UserId,
} from './id.ts'
export {
  newCodeId,
  newFolderId,
  newShareToken,
  newUserId,
  parseCodeId,
  parseFolderId,
  parseShareToken,
  parseSpecHash,
  parseUserId,
} from './id.ts'
export type { Err, Ok, Result } from './result.ts'
export { collectResults, err, flatMapResult, isErr, isOk, mapResult, ok } from './result.ts'
export type { CommonRpcError, RpcDecodeError } from './rpc.ts'
export { RPC_HEADER, decodeCommonRpcError, decodeRpcEnvelope } from './rpc.ts'
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
