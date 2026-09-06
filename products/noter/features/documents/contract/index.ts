/**
 * @noter/documents の契約。文書・参加者・共有リンクの形だけを置く。
 * 実装（D1 / Durable Object）には依存しない。
 */
export type {
  Document,
  DocumentAccess,
  DocumentHeader,
  DocumentMember,
  DocumentSummary,
  MemberSummary,
  ShareLink,
  ShareLinkView,
} from './document.ts'
export type { DocumentError, ShareLinkUnusable, TitleError } from './errors.ts'
export { describeDocumentError } from './errors.ts'
export type { DocumentSummaryWire, DocumentWire, MemberSummaryWire, ShareLinkWire } from './wire.ts'
export {
  parseDocumentSummaryWire,
  parseDocumentWire,
  parseList,
  parseMemberSummaryWire,
  parseRoleOrViewer,
  parseShareLinkWire,
  toDocumentSummaryWire,
  toDocumentWire,
  toMemberSummaryWire,
  toShareLinkWire,
} from './wire.ts'
