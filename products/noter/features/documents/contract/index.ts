/**
 * @noter/documents の契約。文書・参加者・共有リンクの形だけを置く。
 * 実装（D1 / Durable Object）には依存しない。
 */
export type {
  Document,
  DocumentAccess,
  DocumentMember,
  DocumentSummary,
  MemberSummary,
  ShareLink,
} from './document.ts'
