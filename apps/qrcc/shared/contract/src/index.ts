/**
 * @qrcc/contract — qrcc の全レイヤが依存してよい共有型。
 *
 * プロダクト共通の型（Result・Brand・base32・検証済み文字列・ID の部品・UserId）は
 * `@rimltools/contract` の再 export。qrcc 固有の型だけをこのパッケージで定義する。
 *
 * ここには実装依存も I/O もない。時計・乱数・ネットワークが要るものは
 * 引数として受け取る形（例: `RandomBytes`）でのみ表現する。
 */
export { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from '@rimltools/contract'
export type { Brand } from '@rimltools/contract'
export { makeParser } from '@rimltools/contract'
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
export {
  parseLocalDevOrigin,
  resolvePublicOrigin,
  resolvePublicOriginFromEnv,
} from '@rimltools/contract'
export type { Err, Ok, Result } from '@rimltools/contract'
export { collectResults, err, flatMapResult, isErr, isOk, mapResult, ok } from '@rimltools/contract'
export type { CommonRpcError, RpcDecodeError } from './rpc.ts'
export { RPC_HEADER, decodeCommonRpcError, decodeRpcEnvelope } from './rpc.ts'
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
