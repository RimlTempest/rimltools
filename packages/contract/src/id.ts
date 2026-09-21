/**
 * エンティティ識別子を安全に作るための共通部品と、全プロダクト共通の `UserId`。
 *
 * - 種類ごとに接頭辞を持たせ、取り違えを実行時にも検出できるようにする
 * - 本体は Crockford base32（`i` `l` `o` `u` を含まない）24 文字（= 120 bit）で、
 *   人が読み上げても誤りにくく、大文字小文字の揺れも起きない
 * - 乱数は **引数で受け取る**。この層は I/O を持たない
 *   （`crypto.getRandomValues` の注入は composition root の仕事）
 *
 * プロダクト固有の ID（qrcc の `CodeId`、noter の `DocumentId` など）は、
 * 各プロダクトの `shared/contract` がここの部品で定義する。
 */
import { CROCKFORD_BASE32_ALPHABET, encodeCrockfordBase32 } from './base32.ts'
import type { Brand } from './brand.ts'
import { makeParser } from './brand.ts'
import type { Result } from './result.ts'

export type UserId = Brand<string, 'UserId'>

export type IdParseError = {
  readonly kind: 'invalid_id'
  readonly expected: string
  /** 診断用に切り詰めた入力。長い入力をそのままログに流さない。 */
  readonly received: string
}

/** 乱数源。テストでは決定的な実装を渡す。 */
export type RandomBytes = (byteLength: number) => Uint8Array

export const ID_BODY_LENGTH = 24
/** 5 bit/文字なので、必要バイト数は ceil(文字数 * 5 / 8)。 */
const ID_RANDOM_BYTES = 15
const RECEIVED_PREVIEW_LENGTH = 32

const bodyPattern = new RegExp(`^[${CROCKFORD_BASE32_ALPHABET}]{${ID_BODY_LENGTH}}$`)

/** エラーに載せる入力を 32 文字で切り詰める。 */
export const previewReceived = (value: string): string =>
  value.length <= RECEIVED_PREVIEW_LENGTH ? value : `${value.slice(0, RECEIVED_PREVIEW_LENGTH)}…`

/** `<prefix>_` + 24 文字の Crockford base32 か。型ガードの本体に使う。 */
export const hasPrefixedShape = (prefix: string, value: string): boolean =>
  value.startsWith(`${prefix}_`) && bodyPattern.test(value.slice(prefix.length + 1))

export const prefixedIdParser = <T extends string>(
  prefix: string,
  guard: (value: string) => value is T,
) =>
  makeParser(guard, (value: string): IdParseError => ({
    kind: 'invalid_id',
    expected: `${prefix}_ followed by ${ID_BODY_LENGTH} Crockford base32 characters`,
    received: previewReceived(value),
  }))

/**
 * 発行した文字列を必ずパーサに通す。`as` を使わずにブランドを付ける唯一の方法であり、
 * 同時にエンコーダの不具合を検出する健全性チェックにもなる。
 */
export const issuePrefixed =
  <T extends string>(prefix: string, parse: (value: string) => Result<T, IdParseError>) =>
  (random: RandomBytes): Result<T, IdParseError> =>
    parse(`${prefix}_${encodeCrockfordBase32(random(ID_RANDOM_BYTES))}`)

const isUserId = (value: string): value is UserId => hasPrefixedShape('usr', value)

export const parseUserId = prefixedIdParser('usr', isUserId)
export const newUserId = issuePrefixed('usr', parseUserId)
