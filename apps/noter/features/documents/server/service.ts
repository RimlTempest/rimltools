/**
 * 文書のユースケース。**認可はここに集約する**。
 *
 * 画面（server function / server route）はここを呼ぶだけで、権限表も上限も
 * 知らない。判定は `can(role, action)` 1 枚（ADR-0011）で、`/ws/` の認可
 * （`services/web/src/server/ws-authorize.ts`）と同じ関数を通る。
 *
 * I/O は `DocumentServiceDeps` として引数で受け取る。時計も乱数も
 * Durable Object への呼び出しも、この層では作らない。
 */
import {
  MAX_DOCUMENTS_PER_USER,
  MAX_MEMBERS,
  err,
  newDocumentId,
  newShareToken,
  ok,
} from '@noter/contract'
import type {
  DocumentId,
  DocumentKind,
  RandomBytes,
  Result,
  Role,
  ShareToken,
  UserId,
} from '@noter/contract'
import { actorUserId, shareRoleDenial } from '@noter/auth/contract'
import type { Actor, ShareRole } from '@noter/auth/contract'
import type {
  Document,
  DocumentAccess,
  DocumentSummary,
  MemberSummary,
  ShareLink,
} from '../contract/document.ts'
import type { DocumentError } from '../contract/errors.ts'
import type { Action } from '../core/permission.ts'
import { can } from '../core/permission.ts'
import { resolveJoinedRole } from '../core/join.ts'
import { expiryFromDays, isShareLinkUsable } from '../core/share-link.ts'
import { DEFAULT_TITLE, normalizeTitle } from '../core/title.ts'
import type { DocumentRepository } from './repository.ts'

export type DocumentServiceDeps = {
  readonly repository: DocumentRepository
  readonly now: () => Date
  readonly randomBytes: RandomBytes
  /**
   * 権限を失った actor の接続を切る（DO の `/kick`、docs/realtime-protocol.md §5）。
   * 失敗しても操作は成立させる（次の再接続で新しい役割になる）。
   */
  readonly kick: (documentId: DocumentId, actorId: UserId) => Promise<void>
}

/** エディタ画面が 1 回の往復で必要とするもの。 */
export type DocumentView = {
  readonly document: Document
  readonly role: Role
  readonly members: readonly MemberSummary[]
}

export type CreateShareLinkInput = {
  readonly documentId: DocumentId
  readonly role: ShareRole
  /** `undefined` は無期限（owner の明示選択）。 */
  readonly expiresInDays: number | undefined
}

export type DocumentService = {
  readonly create: (actor: Actor, kind: DocumentKind) => Promise<Result<Document, DocumentError>>
  readonly list: (actor: Actor) => Promise<Result<readonly DocumentSummary[], DocumentError>>
  readonly open: (
    actor: Actor,
    documentId: DocumentId,
  ) => Promise<Result<DocumentView, DocumentError>>
  readonly rename: (
    actor: Actor,
    documentId: DocumentId,
    title: string,
  ) => Promise<Result<string, DocumentError>>
  readonly remove: (actor: Actor, documentId: DocumentId) => Promise<Result<void, DocumentError>>
  readonly leave: (actor: Actor, documentId: DocumentId) => Promise<Result<void, DocumentError>>
  readonly createShareLink: (
    actor: Actor,
    input: CreateShareLinkInput,
  ) => Promise<Result<ShareLink, DocumentError>>
  readonly revokeShareLink: (
    actor: Actor,
    documentId: DocumentId,
    token: ShareToken,
  ) => Promise<Result<void, DocumentError>>
  readonly listShareLinks: (
    actor: Actor,
    documentId: DocumentId,
  ) => Promise<Result<readonly ShareLink[], DocumentError>>
  readonly removeMember: (
    actor: Actor,
    documentId: DocumentId,
    userId: UserId,
  ) => Promise<Result<void, DocumentError>>
  readonly changeMemberRole: (
    actor: Actor,
    documentId: DocumentId,
    userId: UserId,
    role: Role,
  ) => Promise<Result<void, DocumentError>>
  /**
   * トークンを検証するだけ。**書き込みも、セッションの発行も伴わない。**
   *
   * `/s/:token` はゲストを発行する前にこれを通す。順番を逆にすると、
   * 当てずっぽうの URL を叩くだけで D1 に user と session の行を作れてしまう。
   */
  readonly resolveShareLink: (token: ShareToken) => Promise<Result<ShareLink, DocumentError>>
  /** 共有リンクを開いた人をメンバーにする。入れたら文書 ID を返す。 */
  readonly join: (actor: Actor, token: ShareToken) => Promise<Result<DocumentId, DocumentError>>
  /** `/d/:id/raw` の認可。本文の取得は呼び出し側（DO の `/snapshot`）。 */
  readonly authorizeRaw: (
    actor: Actor,
    documentId: DocumentId,
  ) => Promise<Result<Document, DocumentError>>
  /** `/ws/:id` の認可。visitor は 401、非メンバーは 404 に対応する。 */
  readonly authorizeRead: (
    actor: Actor,
    documentId: DocumentId,
  ) => Promise<Result<DocumentAccess, DocumentError>>
}

const NOT_FOUND: DocumentError = { kind: 'not_found' }
const FORBIDDEN: DocumentError = { kind: 'forbidden' }
const SIGN_IN_REQUIRED: DocumentError = { kind: 'sign_in_required' }

export const makeDocumentService = (deps: DocumentServiceDeps): DocumentService => {
  const { repository } = deps

  /** メンバーであることと、その操作が許されていることを 1 か所で確かめる。 */
  const authorize = async (
    actor: Actor,
    documentId: DocumentId,
    action: Action,
  ): Promise<
    Result<{ readonly access: DocumentAccess; readonly userId: UserId }, DocumentError>
  > => {
    const userId = actorUserId(actor)
    if (userId === undefined) return err(SIGN_IN_REQUIRED)

    const found = await repository.findForActor(documentId, userId)
    if (!found.ok) return err(found.error)
    if (found.value === undefined) return err(NOT_FOUND)
    if (!can(found.value.role, action)) return err(FORBIDDEN)
    return ok({ access: found.value, userId })
  }

  const create = async (
    actor: Actor,
    kind: DocumentKind,
  ): Promise<Result<Document, DocumentError>> => {
    const ownerId = actorUserId(actor)
    if (ownerId === undefined) return err(SIGN_IN_REQUIRED)

    const owned = await repository.countOwnedByUser(ownerId)
    if (!owned.ok) return err(owned.error)
    if (owned.value >= MAX_DOCUMENTS_PER_USER) return err({ kind: 'document_limit' })

    const id = newDocumentId(deps.randomBytes)
    if (!id.ok) {
      return err({ kind: 'storage_unavailable', detail: '文書 ID を発行できなかった' })
    }

    const now = deps.now()
    const document: Document = {
      id: id.value,
      ownerId,
      kind,
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    }
    const created = await repository.create(document)
    return created.ok ? ok(document) : err(created.error)
  }

  const list = async (actor: Actor): Promise<Result<readonly DocumentSummary[], DocumentError>> => {
    const userId = actorUserId(actor)
    // visitor には見せる文書が無い。エラーではなく空の一覧
    if (userId === undefined) return ok([])
    const rows = await repository.listForUser(userId)
    return rows.ok ? rows : err(rows.error)
  }

  const open = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<DocumentView, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'read')
    if (!authorized.ok) return authorized
    const members = await repository.listMembers(documentId)
    if (!members.ok) return err(members.error)
    return ok({
      document: authorized.value.access.document,
      role: authorized.value.access.role,
      members: members.value,
    })
  }

  const rename = async (
    actor: Actor,
    documentId: DocumentId,
    title: string,
  ): Promise<Result<string, DocumentError>> => {
    const normalized = normalizeTitle(title)
    if (!normalized.ok) return err({ kind: 'invalid_title', reason: normalized.error })

    const authorized = await authorize(actor, documentId, 'rename')
    if (!authorized.ok) return authorized

    const renamed = await repository.rename(documentId, normalized.value, deps.now())
    return renamed.ok ? ok(normalized.value) : err(renamed.error)
  }

  /**
   * 削除は soft delete だけ行い、DO の `/kick` は呼ばない。
   * 開いたままの接続は次の再接続で `4404` になる（v1 はこれで十分、plan 004）。
   */
  const remove = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<void, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'delete')
    if (!authorized.ok) return authorized
    const deleted = await repository.softDelete(documentId, deps.now())
    return deleted.ok ? ok(undefined) : err(deleted.error)
  }

  const leave = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<void, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'read')
    if (!authorized.ok) return authorized
    if (authorized.value.access.role === 'owner') return err({ kind: 'owner_cannot_leave' })

    const removed = await repository.removeMember(documentId, authorized.value.userId)
    if (!removed.ok) return err(removed.error)
    await deps.kick(documentId, authorized.value.userId)
    return ok(undefined)
  }

  const createShareLink = async (
    actor: Actor,
    input: CreateShareLinkInput,
  ): Promise<Result<ShareLink, DocumentError>> => {
    const authorized = await authorize(actor, input.documentId, 'share')
    if (!authorized.ok) return authorized

    // ゲスト owner は viewer リンクしか作れない（ADR-0010 / ADR-0011）
    const denied = shareRoleDenial(actor, input.role)
    if (denied !== undefined) return err({ kind: 'share_role_denied', denied })

    const token = newShareToken(deps.randomBytes)
    if (!token.ok) {
      return err({ kind: 'storage_unavailable', detail: '共有トークンを発行できなかった' })
    }

    const now = deps.now()
    const link: ShareLink = {
      token: token.value,
      documentId: input.documentId,
      role: input.role,
      createdBy: authorized.value.userId,
      createdAt: now,
      expiresAt: expiryFromDays(now, input.expiresInDays),
      revokedAt: undefined,
    }
    const created = await repository.createShareLink(link)
    return created.ok ? ok(link) : err(created.error)
  }

  const revokeShareLink = async (
    actor: Actor,
    documentId: DocumentId,
    token: ShareToken,
  ): Promise<Result<void, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'share')
    if (!authorized.ok) return authorized

    // 別の文書のトークンを失効させられないよう、文書 ID の一致を確かめる
    const found = await repository.findShareLinkTarget(token)
    if (!found.ok) return err(found.error)
    if (found.value === undefined || found.value.link.documentId !== documentId) {
      return err(NOT_FOUND)
    }

    const revoked = await repository.revokeShareLink(token, deps.now())
    return revoked.ok ? ok(undefined) : err(revoked.error)
  }

  const listShareLinks = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<readonly ShareLink[], DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'share')
    if (!authorized.ok) return authorized
    const links = await repository.listShareLinks(documentId)
    return links.ok ? links : err(links.error)
  }

  const removeMember = async (
    actor: Actor,
    documentId: DocumentId,
    userId: UserId,
  ): Promise<Result<void, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'remove_member')
    if (!authorized.ok) return authorized
    // 所有者を外すと誰も管理できなくなる
    if (authorized.value.access.document.ownerId === userId) return err(FORBIDDEN)

    const removed = await repository.removeMember(documentId, userId)
    if (!removed.ok) return err(removed.error)
    await deps.kick(documentId, userId)
    return ok(undefined)
  }

  const changeMemberRole = async (
    actor: Actor,
    documentId: DocumentId,
    userId: UserId,
    role: Role,
  ): Promise<Result<void, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'remove_member')
    if (!authorized.ok) return authorized
    if (authorized.value.access.document.ownerId === userId) return err(FORBIDDEN)
    // owner は 1 文書 1 人。リンクでも手動でも増やせない（ADR-0011）
    if (role === 'owner') return err(FORBIDDEN)

    const changed = await repository.changeMemberRole(documentId, userId, role)
    if (!changed.ok) return err(changed.error)
    await deps.kick(documentId, userId)
    return ok(undefined)
  }

  const resolveShareLink = async (token: ShareToken): Promise<Result<ShareLink, DocumentError>> => {
    const found = await repository.findShareLinkTarget(token)
    if (!found.ok) return err(found.error)

    const usable = isShareLinkUsable(found.value?.link, deps.now())
    if (!usable.ok) return err({ kind: 'link_unusable', reason: usable.error })

    // 行き先が消えていれば、リンクが生きていても入れない。
    // 理由を分けないのは、トークンの持ち主以外に文書の有無を教えないため
    if (found.value === undefined || !found.value.documentExists) {
      return err({ kind: 'link_unusable', reason: 'not_found' })
    }
    if (found.value.documentDeletedAt !== undefined) {
      return err({ kind: 'link_unusable', reason: 'not_found' })
    }
    return ok(usable.value)
  }

  const join = async (
    actor: Actor,
    token: ShareToken,
  ): Promise<Result<DocumentId, DocumentError>> => {
    const userId = actorUserId(actor)
    if (userId === undefined) return err(SIGN_IN_REQUIRED)

    // 検証は 1 か所に置く。ここを飛ばして書き込む経路を作らない
    const resolved = await resolveShareLink(token)
    if (!resolved.ok) return resolved
    const link = resolved.value

    const access = await repository.findForActor(link.documentId, userId)
    if (!access.ok) return err(access.error)

    const existing = access.value?.role
    const role = resolveJoinedRole(existing, link.role)
    // 既に同じか強い役割なら 1 行も書かない（ADR-0011 の帰結）
    if (existing === role) return ok(link.documentId)

    if (existing === undefined) {
      const members = await repository.countMembers(link.documentId)
      if (!members.ok) return err(members.error)
      if (members.value >= MAX_MEMBERS) return err({ kind: 'member_limit' })
    }

    const joined = await repository.upsertMember(link.documentId, userId, role, deps.now())
    return joined.ok ? ok(link.documentId) : err(joined.error)
  }

  const authorizeRaw = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<Document, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'export_raw')
    return authorized.ok ? ok(authorized.value.access.document) : authorized
  }

  const authorizeRead = async (
    actor: Actor,
    documentId: DocumentId,
  ): Promise<Result<DocumentAccess, DocumentError>> => {
    const authorized = await authorize(actor, documentId, 'read')
    return authorized.ok ? ok(authorized.value.access) : authorized
  }

  return {
    create,
    list,
    open,
    rename,
    remove,
    leave,
    createShareLink,
    revokeShareLink,
    listShareLinks,
    removeMember,
    changeMemberRole,
    resolveShareLink,
    join,
    authorizeRaw,
    authorizeRead,
  }
}
