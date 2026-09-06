/**
 * 文書種別。本文の解釈（構文解析・診断・プレビュー）を決める唯一の軸。
 *
 * 種別を足すときはこの配列に 1 行足すだけで済むようにしてある
 * （`FILE_EXTENSION` / `MIME_TYPE` は網羅を型で強制するので、足し忘れると
 * コンパイルエラーになる）。
 */
import type { Result } from './result.ts'
import { err, ok } from './result.ts'

export const DOCUMENT_KINDS = ['markdown', 'yaml', 'toml', 'json'] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export type DocumentKindParseError = {
  readonly kind: 'invalid_document_kind'
  readonly expected: readonly DocumentKind[]
  readonly received: string
}

const isDocumentKind = (value: string): value is DocumentKind =>
  DOCUMENT_KINDS.some((candidate) => candidate === value)

export const parseDocumentKind = (value: string): Result<DocumentKind, DocumentKindParseError> =>
  isDocumentKind(value)
    ? ok(value)
    : err({ kind: 'invalid_document_kind', expected: DOCUMENT_KINDS, received: value })

/** ダウンロード名に使う拡張子（先頭の `.` は含まない）。 */
export const FILE_EXTENSION: { readonly [K in DocumentKind]: string } = {
  markdown: 'md',
  yaml: 'yaml',
  toml: 'toml',
  json: 'json',
}

/** `/d/:id/raw` の Content-Type。 */
export const MIME_TYPE: { readonly [K in DocumentKind]: string } = {
  markdown: 'text/markdown',
  yaml: 'application/yaml',
  toml: 'application/toml',
  json: 'application/json',
}
