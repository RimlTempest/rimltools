/**
 * エンティティ識別子と、それを安全に作る手段。
 *
 * - 種類ごとに接頭辞を持たせ、取り違えを実行時にも検出できるようにする
 * - 本体は Crockford base32（`i` `l` `o` `u` を含まない）で、
 *   人が読み上げても誤りにくく、大文字小文字の揺れも起きない
 * - 乱数は **引数で受け取る**。この層は I/O を持たない
 *   （`crypto.getRandomValues` の注入は composition root の仕事）
 *
 * `ShareToken` も同じ 24 文字（= 120 bit）。総当たりで当てられない長さがあるので、
 * 他の ID と表記を揃えて扱いを単純にする（docs/domain-model.md §識別子）。
 */
import { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
import type { Brand } from './brand.ts'
import { makeParser } from './brand.ts'
import type { Result } from './result.ts'

export type UserId = Brand<string, 'UserId'>
export type DocumentId = Brand<string, 'DocumentId'>
/** 共有リンクの入口。推測不能であることが認可の前提（ADR-0011）。 */
export type ShareToken = Brand<string, 'ShareToken'>

export type IdParseError = {
  readonly kind: 'invalid_id'
  readonly expected: string
  /** 診断用に切り詰めた入力。長い入力をそのままログに流さない。 */
  readonly received: string
}

/** 乱数源。テストでは決定的な実装を渡す。 */
export type RandomBytes = (byteLength: number) => Uint8Array

const ID_BODY_LENGTH = 24
/** 5 bit/文字なので、必要バイト数は ceil(文字数 * 5 / 8)。 */
const ID_RANDOM_BYTES = 15
const RECEIVED_PREVIEW_LENGTH = 32

const bodyPattern = new RegExp(`^[${CROCKFORD_BASE32_ALPHABET}]{${ID_BODY_LENGTH}}$`)

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
const isDocumentId = (value: string): value is DocumentId => hasPrefixedShape('doc', value)
const isShareToken = (value: string): value is ShareToken => hasPrefixedShape('shr', value)

export const parseUserId = prefixedIdParser('usr', isUserId)
export const parseDocumentId = prefixedIdParser('doc', isDocumentId)
export const parseShareToken = prefixedIdParser('shr', isShareToken)

/**
 * 発行した文字列を必ずパーサに通す。`as` を使わずにブランドを付ける唯一の方法であり、
 * 同時にエンコーダの不具合を検出する健全性チェックにもなる。
 */
const issuePrefixed =
  <T extends string>(prefix: string, parse: (value: string) => Result<T, IdParseError>) =>
  (random: RandomBytes): Result<T, IdParseError> =>
    parse(`${prefix}_${encodeCrockfordBase32(random(ID_RANDOM_BYTES))}`)

export const newUserId = issuePrefixed('usr', parseUserId)
export const newDocumentId = issuePrefixed('doc', parseDocumentId)
export const newShareToken = issuePrefixed('shr', parseShareToken)
