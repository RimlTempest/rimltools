/**
 * 取り込みの大きさを見る（docs/design/ux.md §4.2）。
 *
 * 上限を超える取り込みは**拒否して理由を出す**。黙って切り詰めると、
 * 何が失われたか分からないまま同期されてしまう。
 */
import { MAX_DOCUMENT_BYTES } from '@noter/contract'
import type { Result } from '@noter/contract'
import { err, ok } from '@noter/contract'
import type { ImportError } from '../contract/import-error.ts'

/** UTF-8 のバイト数。上限は文字数ではなくバイトで決まっている。 */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length

export const checkImportSize = (bytes: number): Result<void, ImportError> =>
  bytes > MAX_DOCUMENT_BYTES
    ? err({ kind: 'too_large', max: MAX_DOCUMENT_BYTES, bytes })
    : ok(undefined)
