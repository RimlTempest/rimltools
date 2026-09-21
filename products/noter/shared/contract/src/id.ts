/**
 * noter のエンティティ識別子。
 *
 * 接頭辞付き ID の部品（24 文字の Crockford base32 本体・パーサ・発行）と `UserId` は
 * `@rimltools/contract` の共通実装を使う。ここには noter 固有の ID だけを置く。
 *
 * `ShareToken` も同じ 24 文字（= 120 bit）。総当たりで当てられない長さがあるので、
 * 他の ID と表記を揃えて扱いを単純にする（docs/domain-model.md §識別子）。
 */
import type { Brand } from '@rimltools/contract'
import { hasPrefixedShape, issuePrefixed, prefixedIdParser } from '@rimltools/contract'

export type { IdParseError, RandomBytes, UserId } from '@rimltools/contract'
export { newUserId, parseUserId } from '@rimltools/contract'

export type DocumentId = Brand<string, 'DocumentId'>
/** 共有リンクの入口。推測不能であることが認可の前提（ADR-0011）。 */
export type ShareToken = Brand<string, 'ShareToken'>

const isDocumentId = (value: string): value is DocumentId => hasPrefixedShape('doc', value)
const isShareToken = (value: string): value is ShareToken => hasPrefixedShape('shr', value)

export const parseDocumentId = prefixedIdParser('doc', isDocumentId)
export const parseShareToken = prefixedIdParser('shr', isShareToken)

export const newDocumentId = issuePrefixed('doc', parseDocumentId)
export const newShareToken = issuePrefixed('shr', parseShareToken)
