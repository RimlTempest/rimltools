/**
 * 構造化データとして解釈する文書種別。
 *
 * markdown だけは「値」を持たないので、整形・変換・ツリープレビューの
 * 引数からは型で締め出す（実行時の分岐を 1 つ減らす）。
 */
import type { DocumentKind } from '@noter/contract'

export type DataDocumentKind = Exclude<DocumentKind, 'markdown'>

export const DATA_DOCUMENT_KINDS: readonly DataDocumentKind[] = ['yaml', 'toml', 'json']

export const isDataDocumentKind = (kind: DocumentKind): kind is DataDocumentKind =>
  kind !== 'markdown'
