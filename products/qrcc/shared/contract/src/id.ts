/**
 * エンティティ識別子と、それを安全に作る手段。
 *
 * - 種類ごとに接頭辞を持たせ、取り違えを実行時にも検出できるようにする
 * - 本体は Crockford base32（`i` `l` `o` `u` を含まない）で、
 *   人が読み上げても誤りにくく、大文字小文字の揺れも起きない
 * - 乱数は **引数で受け取る**。この層は I/O を持たない
 *   （`crypto.getRandomValues` の注入は composition root の仕事）
 */
import { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
import type { Brand } from './brand.ts'
import { makeParser } from './brand.ts'
import type { Result } from './result.ts'

export type UserId = Brand<string, 'UserId'>
export type CodeId = Brand<string, 'CodeId'>
export type FolderId = Brand<string, 'FolderId'>
export type ShareToken = Brand<string, 'ShareToken'>
/** 生成仕様の SHA-256（R2 のキャッシュキー）。64 文字の小文字 16 進。 */
export type SpecHash = Brand<string, 'SpecHash'>

export type IdParseError = {
  readonly kind: 'invalid_id'
  readonly expected: string
  /** 診断用に切り詰めた入力。長い入力をそのままログに流さない。 */
  readonly received: string
}

/** 乱数源。テストでは決定的な実装を渡す。 */
export type RandomBytes = (byteLength: number) => Uint8Array

const ID_BODY_LENGTH = 24
const TOKEN_LENGTH = 32
/** 5 bit/文字なので、必要バイト数は ceil(文字数 * 5 / 8)。 */
const ID_RANDOM_BYTES = 15
const TOKEN_RANDOM_BYTES = 20
const RECEIVED_PREVIEW_LENGTH = 32

const bodyPattern = new RegExp(`^[${CROCKFORD_BASE32_ALPHABET}]{${ID_BODY_LENGTH}}$`)
const tokenPattern = new RegExp(`^[${CROCKFORD_BASE32_ALPHABET}]{${TOKEN_LENGTH}}$`)
const specHashPattern = /^[0-9a-f]{64}$/

const preview = (value: string): string =>
  value.length <= RECEIVED_PREVIEW_LENGTH ? value : `${value.slice(0, RECEIVED_PREVIEW_LENGTH)}…`

const hasPrefixedShape = (prefix: string, value: string): boolean =>
  value.startsWith(`${prefix}_`) && bodyPattern.test(value.slice(prefix.length + 1))

const prefixedIdParser = <T extends string>(prefix: string, guard: (value: string) => value is T) =>
  makeParser(guard, (value: string): IdParseError => ({
    kind: 'invalid_id',
    expected: `${prefix}_ followed by ${ID_BODY_LENGTH} Crockford base32 characters`,
    received: preview(value),
  }))

const isUserId = (value: string): value is UserId => hasPrefixedShape('usr', value)
const isCodeId = (value: string): value is CodeId => hasPrefixedShape('cd', value)
const isFolderId = (value: string): value is FolderId => hasPrefixedShape('fld', value)
const isShareToken = (value: string): value is ShareToken => tokenPattern.test(value)
const isSpecHash = (value: string): value is SpecHash => specHashPattern.test(value)

export const parseUserId = prefixedIdParser('usr', isUserId)
export const parseCodeId = prefixedIdParser('cd', isCodeId)
export const parseFolderId = prefixedIdParser('fld', isFolderId)

export const parseShareToken = makeParser(isShareToken, (value: string): IdParseError => ({
  kind: 'invalid_id',
  expected: `${TOKEN_LENGTH} Crockford base32 characters`,
  received: preview(value),
}))

export const parseSpecHash = makeParser(isSpecHash, (value: string): IdParseError => ({
  kind: 'invalid_id',
  expected: '64 lowercase hexadecimal characters',
  received: preview(value),
}))

/**
 * 発行した文字列を必ずパーサに通す。`as` を使わずにブランドを付ける唯一の方法であり、
 * 同時にエンコーダの不具合を検出する健全性チェックにもなる。
 */
const issuePrefixed =
  <T extends string>(prefix: string, parse: (value: string) => Result<T, IdParseError>) =>
  (random: RandomBytes): Result<T, IdParseError> =>
    parse(`${prefix}_${encodeCrockfordBase32(random(ID_RANDOM_BYTES))}`)

export const newUserId = issuePrefixed('usr', parseUserId)
export const newCodeId = issuePrefixed('cd', parseCodeId)
export const newFolderId = issuePrefixed('fld', parseFolderId)

export const newShareToken = (random: RandomBytes): Result<ShareToken, IdParseError> =>
  parseShareToken(encodeCrockfordBase32(random(TOKEN_RANDOM_BYTES)))
