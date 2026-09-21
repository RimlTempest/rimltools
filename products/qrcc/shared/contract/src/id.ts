/**
 * qrcc のエンティティ識別子。
 *
 * 接頭辞付き ID の部品（24 文字の Crockford base32 本体・パーサ・発行）と `UserId` は
 * `@rimltools/contract` の共通実装を使う。ここには qrcc 固有の ID だけを置く。
 * 乱数は **引数で受け取る**。この層は I/O を持たない。
 */
import type { Brand, IdParseError, RandomBytes, Result } from '@rimltools/contract'
import {
  CROCKFORD_BASE32_ALPHABET,
  encodeCrockfordBase32,
  hasPrefixedShape,
  issuePrefixed,
  makeParser,
  prefixedIdParser,
  previewReceived,
} from '@rimltools/contract'

export type { IdParseError, RandomBytes, UserId } from '@rimltools/contract'
export { newUserId, parseUserId } from '@rimltools/contract'

export type CodeId = Brand<string, 'CodeId'>
export type FolderId = Brand<string, 'FolderId'>
export type ShareToken = Brand<string, 'ShareToken'>
/** 生成仕様の SHA-256（R2 のキャッシュキー）。64 文字の小文字 16 進。 */
export type SpecHash = Brand<string, 'SpecHash'>

const TOKEN_LENGTH = 32
/** 5 bit/文字なので、必要バイト数は ceil(文字数 * 5 / 8)。 */
const TOKEN_RANDOM_BYTES = 20

const tokenPattern = new RegExp(`^[${CROCKFORD_BASE32_ALPHABET}]{${TOKEN_LENGTH}}$`)
const specHashPattern = /^[0-9a-f]{64}$/

const isCodeId = (value: string): value is CodeId => hasPrefixedShape('cd', value)
const isFolderId = (value: string): value is FolderId => hasPrefixedShape('fld', value)
const isShareToken = (value: string): value is ShareToken => tokenPattern.test(value)
const isSpecHash = (value: string): value is SpecHash => specHashPattern.test(value)

export const parseCodeId = prefixedIdParser('cd', isCodeId)
export const parseFolderId = prefixedIdParser('fld', isFolderId)

export const parseShareToken = makeParser(isShareToken, (value: string): IdParseError => ({
  kind: 'invalid_id',
  expected: `${TOKEN_LENGTH} Crockford base32 characters`,
  received: previewReceived(value),
}))

export const parseSpecHash = makeParser(isSpecHash, (value: string): IdParseError => ({
  kind: 'invalid_id',
  expected: '64 lowercase hexadecimal characters',
  received: previewReceived(value),
}))

export const newCodeId = issuePrefixed('cd', parseCodeId)
export const newFolderId = issuePrefixed('fld', parseFolderId)

export const newShareToken = (random: RandomBytes): Result<ShareToken, IdParseError> =>
  parseShareToken(encodeCrockfordBase32(random(TOKEN_RANDOM_BYTES)))
