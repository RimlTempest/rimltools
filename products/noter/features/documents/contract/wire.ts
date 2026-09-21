/**
 * server function の戻り値として運ぶための形（`actor-wire.ts` と同じ考え方）。
 *
 * `Date` も Branded 型もそのままではワイヤに乗らない。文字列にして送り、
 * **受け側で必ず検証し直す**。読めなかった行は落とす（画面に嘘を出さない）。
 */
import {
  parseDocumentId,
  parseDocumentKind,
  parseRole,
  parseShareToken,
  parseUserId,
} from '@noter/contract'
import type { DocumentId, DocumentKind, Role, ShareToken, UserId } from '@noter/contract'
import { SHARE_ROLES } from '@noter/auth/contract'
import type { ShareRole } from '@noter/auth/contract'
import type { DocumentHeader, DocumentSummary, MemberSummary, ShareLinkView } from './document.ts'

export type DocumentSummaryWire = {
  readonly id: string
  readonly title: string
  readonly kind: string
  readonly role: string
  readonly updatedAt: string
}

export type MemberSummaryWire = {
  readonly userId: string
  readonly displayName: string
  readonly role: string
}

export type ShareLinkWire = {
  readonly token: string
  readonly documentId: string
  readonly role: string
  readonly createdAt: string
  /** `null` は無期限。 */
  readonly expiresAt: string | null
}

export type DocumentWire = {
  readonly id: string
  readonly ownerId: string
  readonly title: string
  readonly kind: string
  readonly updatedAt: string
}

const readString = (source: Record<string, unknown>, key: string): string => {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? { ...value } : undefined

const readDate = (raw: string): Date | undefined => {
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const isShareRole = (role: Role): role is ShareRole =>
  SHARE_ROLES.some((candidate) => candidate === role)

export const toDocumentSummaryWire = (summary: DocumentSummary): DocumentSummaryWire => ({
  id: summary.id,
  title: summary.title,
  kind: summary.kind,
  role: summary.role,
  updatedAt: summary.updatedAt.toISOString(),
})

export const parseDocumentSummaryWire = (value: unknown): DocumentSummary | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentId(readString(source, 'id'))
  const kind = parseDocumentKind(readString(source, 'kind'))
  const role = parseRole(readString(source, 'role'))
  const updatedAt = readDate(readString(source, 'updatedAt'))
  if (!id.ok || !kind.ok || !role.ok || updatedAt === undefined) return undefined
  return {
    id: id.value,
    title: readString(source, 'title'),
    kind: kind.value,
    role: role.value,
    updatedAt,
  }
}

export const toMemberSummaryWire = (member: MemberSummary): MemberSummaryWire => ({
  userId: member.userId,
  displayName: member.displayName,
  role: member.role,
})

export const parseMemberSummaryWire = (value: unknown): MemberSummary | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const userId = parseUserId(readString(source, 'userId'))
  const role = parseRole(readString(source, 'role'))
  if (!userId.ok || !role.ok) return undefined
  return { userId: userId.value, displayName: readString(source, 'displayName'), role: role.value }
}

export const toShareLinkWire = (link: ShareLinkView): ShareLinkWire => ({
  token: link.token,
  documentId: link.documentId,
  role: link.role,
  createdAt: link.createdAt.toISOString(),
  expiresAt: link.expiresAt === undefined ? null : link.expiresAt.toISOString(),
})

export const parseShareLinkWire = (value: unknown): ShareLinkView | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const token = parseShareToken(readString(source, 'token'))
  const documentId = parseDocumentId(readString(source, 'documentId'))
  const role = parseRole(readString(source, 'role'))
  const createdAt = readDate(readString(source, 'createdAt'))
  if (!token.ok || !documentId.ok || !role.ok || !isShareRole(role.value)) return undefined
  if (createdAt === undefined) return undefined
  const rawExpiry = source['expiresAt']
  return {
    token: token.value,
    documentId: documentId.value,
    role: role.value,
    createdAt,
    expiresAt: typeof rawExpiry === 'string' ? readDate(rawExpiry) : undefined,
  }
}

export const toDocumentWire = (document: DocumentHeader): DocumentWire => ({
  id: document.id,
  ownerId: document.ownerId,
  title: document.title,
  kind: document.kind,
  updatedAt: document.updatedAt.toISOString(),
})

export const parseDocumentWire = (value: unknown): DocumentHeader | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentId(readString(source, 'id'))
  const ownerId = parseUserId(readString(source, 'ownerId'))
  const kind = parseDocumentKind(readString(source, 'kind'))
  const updatedAt = readDate(readString(source, 'updatedAt'))
  if (!id.ok || !ownerId.ok || !kind.ok || updatedAt === undefined) return undefined
  return {
    id: id.value,
    ownerId: ownerId.value,
    kind: kind.value,
    title: readString(source, 'title'),
    updatedAt,
  }
}

/**
 * 役割。読めなければ **一番弱い viewer** に倒す。
 * 画面の表示に使うだけで、本当の認可はサーバがやり直す。
 */
export const parseRoleOrViewer = (value: unknown): Role => {
  const role = parseRole(typeof value === 'string' ? value : '')
  return role.ok ? role.value : 'viewer'
}

/** 読めない行は落とす。1 行壊れても一覧全体を失わせない。 */
export const parseList = <T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
): readonly T[] => {
  if (!Array.isArray(value)) return []
  const parsed: T[] = []
  for (const item of value) {
    const one = parse(item)
    if (one !== undefined) parsed.push(one)
  }
  return parsed
}

/* ------------------------------------------------ server function の入力 */

/**
 * server function の入力は**ネットワークから届く**ので、呼び出し側の型注釈は
 * 実行時の約束にならない。`.validator()` はここを通し、ハンドラには
 * 検証済みの値だけを渡す。
 *
 * 読めない入力は `undefined`。ハンドラはそれを既存の「見つかりません」に
 * 畳む（境界で `throw` せず、値のまま返す）。
 */

const readOptionalString = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

export const parseDocumentIdInput = (value: unknown): DocumentId | undefined => {
  if (typeof value !== 'string') return undefined
  const parsed = parseDocumentId(value)
  return parsed.ok ? parsed.value : undefined
}

export const parseDocumentKindInput = (value: unknown): DocumentKind | undefined => {
  if (typeof value !== 'string') return undefined
  const parsed = parseDocumentKind(value)
  return parsed.ok ? parsed.value : undefined
}

export const parseShareTokenInput = (value: unknown): ShareToken | undefined => {
  if (typeof value !== 'string') return undefined
  const parsed = parseShareToken(value)
  return parsed.ok ? parsed.value : undefined
}

const parseRoleInput = (value: unknown): Role | undefined => {
  if (typeof value !== 'string') return undefined
  const parsed = parseRole(value)
  return parsed.ok ? parsed.value : undefined
}

export const parseRenameInput = (
  value: unknown,
): { readonly documentId: DocumentId; readonly title: string } | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentIdInput(source['documentId'])
  const title = readOptionalString(source, 'title')
  if (id === undefined || title === undefined) return undefined
  return { documentId: id, title }
}

/**
 * 有効期限は「`null`（無期限）」か「1 以上の整数（日）」だけ。
 * 数でない値を通すと `expiryFromDays` が Invalid Date を作り、
 * 二度と使えないリンクが D1 に残る。
 */
const parseExpiresInDays = (value: unknown): { readonly days: number | undefined } | undefined => {
  if (value === null) return { days: undefined }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return undefined
  return { days: value }
}

export const parseCreateLinkInput = (
  value: unknown,
):
  | {
      readonly documentId: DocumentId
      readonly role: Role
      readonly expiresInDays: number | undefined
    }
  | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentIdInput(source['documentId'])
  const role = parseRoleInput(source['role'])
  const expiry = parseExpiresInDays(source['expiresInDays'])
  if (id === undefined || role === undefined || expiry === undefined) return undefined
  return { documentId: id, role, expiresInDays: expiry.days }
}

export const parseTokenInput = (
  value: unknown,
): { readonly documentId: DocumentId; readonly token: ShareToken } | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentIdInput(source['documentId'])
  const token = parseShareTokenInput(source['token'])
  if (id === undefined || token === undefined) return undefined
  return { documentId: id, token }
}

export const parseMemberInput = (
  value: unknown,
): { readonly documentId: DocumentId; readonly userId: UserId } | undefined => {
  const source = asRecord(value)
  if (source === undefined) return undefined
  const id = parseDocumentIdInput(source['documentId'])
  const raw = readOptionalString(source, 'userId')
  const user = raw === undefined ? undefined : parseUserId(raw)
  if (id === undefined || user === undefined || !user.ok) return undefined
  return { documentId: id, userId: user.value }
}

export const parseMemberRoleInput = (
  value: unknown,
):
  | { readonly documentId: DocumentId; readonly userId: UserId; readonly role: Role }
  | undefined => {
  const member = parseMemberInput(value)
  const source = asRecord(value)
  if (member === undefined || source === undefined) return undefined
  const role = parseRoleInput(source['role'])
  return role === undefined ? undefined : { ...member, role }
}
