/**
 * テスト用の固定値。`as` を使わずに Branded 型の値を作るため、
 * 本物のパーサを通し、通らなければその場で落とす（テストの前提が壊れている）。
 */
import { parseDocumentId, parseShareToken, parseUserId } from '@noter/contract'
import type { DocumentId, ShareToken, UserId } from '@noter/contract'

const body = (last: string): string => `${'0'.repeat(23)}${last}`

export const userId = (last: string): UserId => {
  const parsed = parseUserId(`usr_${body(last)}`)
  if (!parsed.ok) throw new Error(`テスト用 UserId が不正: ${parsed.error.received}`)
  return parsed.value
}

export const documentId = (last: string): DocumentId => {
  const parsed = parseDocumentId(`doc_${body(last)}`)
  if (!parsed.ok) throw new Error(`テスト用 DocumentId が不正: ${parsed.error.received}`)
  return parsed.value
}

export const shareToken = (last: string): ShareToken => {
  const parsed = parseShareToken(`shr_${body(last)}`)
  if (!parsed.ok) throw new Error(`テスト用 ShareToken が不正: ${parsed.error.received}`)
  return parsed.value
}
