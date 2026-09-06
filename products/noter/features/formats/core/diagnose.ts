/**
 * 本文から「指摘の一覧」だけを取り出す。
 *
 * 問題パネルと CodeMirror の lint はここだけを見る。値が要るときは
 * `parseDocument` を直接使う。
 */
import type { DocumentKind } from '@noter/contract'
import type { Diagnostic } from '../contract/diagnostic.ts'
import { parseDocument } from './parse.ts'

export const diagnose = (kind: DocumentKind, text: string): readonly Diagnostic[] => {
  const parsed = parseDocument(kind, text)
  return parsed.ok ? [] : parsed.error
}
