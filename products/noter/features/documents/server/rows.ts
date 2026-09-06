/**
 * D1 の行 → ドメイン型。**境界でパースする**のはここだけ。
 *
 * 列が欠けていたり値が想定外だったりしたら、握りつぶさず
 * `storage_unavailable` にする。壊れた `UserId` をそのまま noter-sync の
 * actor に流さないため（ADR-0002）。
 */
import {
  err,
  ok,
  parseDocumentKind,
  parseDocumentId,
  parseRole,
  parseShareToken,
  parseUserId,
} from '@noter/contract'
import type { Result, Role } from '@noter/contract'
import { SHARE_ROLES } from '@noter/auth/contract'
import type { ShareRole } from '@noter/auth/contract'
import type { Document, MemberSummary, ShareLink } from '../contract/document.ts'
import type { SqlRow, StorageError } from './sql.ts'

const broken = (detail: string): StorageError => ({
  kind: 'storage_unavailable',
  detail: `D1 の行が壊れている: ${detail}`,
})

const readString = (row: SqlRow, key: string): string => {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

const readNumber = (row: SqlRow, key: string): number | undefined => {
  const value = row[key]
  return typeof value === 'number' ? value : undefined
}

/** 日時は Unix 秒（INTEGER）で持つ。列が NULL のときは「無い」。 */
const readDate = (row: SqlRow, key: string): Date | undefined => {
  const seconds = readNumber(row, key)
  return seconds === undefined ? undefined : new Date(seconds * 1000)
}

export const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

const isShareRole = (role: Role): role is ShareRole =>
  SHARE_ROLES.some((candidate) => candidate === role)

export const parseDocumentRow = (row: SqlRow): Result<Document, StorageError> => {
  const id = parseDocumentId(readString(row, 'id'))
  if (!id.ok) return err(broken(`document.id=${id.error.received}`))
  const ownerId = parseUserId(readString(row, 'owner_id'))
  if (!ownerId.ok) return err(broken(`document.owner_id=${ownerId.error.received}`))
  const kind = parseDocumentKind(readString(row, 'kind'))
  if (!kind.ok) return err(broken(`document.kind=${kind.error.received}`))
  const createdAt = readDate(row, 'created_at')
  const updatedAt = readDate(row, 'updated_at')
  if (createdAt === undefined || updatedAt === undefined) {
    return err(broken(`document.created_at / updated_at が無い（id=${id.value}）`))
  }

  return ok({
    id: id.value,
    ownerId: ownerId.value,
    kind: kind.value,
    title: readString(row, 'title'),
    createdAt,
    updatedAt,
    deletedAt: readDate(row, 'deleted_at'),
  })
}

/** 一覧用の 1 行。`document` と `document_member` を JOIN した結果を読む。 */
export const parseSummaryRow = (
  row: SqlRow,
): Result<
  { readonly document: Pick<Document, 'id' | 'kind' | 'title' | 'updatedAt'>; readonly role: Role },
  StorageError
> => {
  const id = parseDocumentId(readString(row, 'id'))
  if (!id.ok) return err(broken(`document.id=${id.error.received}`))
  const kind = parseDocumentKind(readString(row, 'kind'))
  if (!kind.ok) return err(broken(`document.kind=${kind.error.received}`))
  const role = parseRole(readString(row, 'role'))
  if (!role.ok) return err(broken(`document_member.role=${role.error.received}`))
  const updatedAt = readDate(row, 'updated_at')
  if (updatedAt === undefined) return err(broken(`document.updated_at が無い（id=${id.value}）`))

  return ok({
    document: { id: id.value, kind: kind.value, title: readString(row, 'title'), updatedAt },
    role: role.value,
  })
}

export const parseMemberRow = (row: SqlRow): Result<MemberSummary, StorageError> => {
  const userId = parseUserId(readString(row, 'user_id'))
  if (!userId.ok) return err(broken(`document_member.user_id=${userId.error.received}`))
  const role = parseRole(readString(row, 'role'))
  if (!role.ok) return err(broken(`document_member.role=${role.error.received}`))

  return ok({
    userId: userId.value,
    displayName: readString(row, 'display_name'),
    role: role.value,
  })
}

export const parseShareLinkRow = (row: SqlRow): Result<ShareLink, StorageError> => {
  const token = parseShareToken(readString(row, 'token'))
  if (!token.ok) return err(broken(`share_link.token=${token.error.received}`))
  const documentId = parseDocumentId(readString(row, 'document_id'))
  if (!documentId.ok) return err(broken(`share_link.document_id=${documentId.error.received}`))
  const role = parseRole(readString(row, 'role'))
  if (!role.ok || !isShareRole(role.value)) {
    return err(broken(`share_link.role=${readString(row, 'role')}`))
  }
  const createdBy = parseUserId(readString(row, 'created_by'))
  if (!createdBy.ok) return err(broken(`share_link.created_by=${createdBy.error.received}`))
  const createdAt = readDate(row, 'created_at')
  if (createdAt === undefined) return err(broken(`share_link.created_at が無い（${token.value}）`))

  return ok({
    token: token.value,
    documentId: documentId.value,
    role: role.value,
    createdBy: createdBy.value,
    createdAt,
    expiresAt: readDate(row, 'expires_at'),
    revokedAt: readDate(row, 'revoked_at'),
  })
}

/** メンバー行の役割だけを読む（`findForActor` の LEFT JOIN 用）。 */
export const parseMemberRole = (row: SqlRow, key: string): Role | undefined => {
  const role = parseRole(readString(row, key))
  return role.ok ? role.value : undefined
}

export const readCount = (rows: readonly SqlRow[], key: string): number =>
  readNumber(rows[0] ?? {}, key) ?? 0
