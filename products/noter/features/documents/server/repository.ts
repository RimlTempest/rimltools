/**
 * 文書・参加者・共有リンクの D1 リポジトリ。
 *
 * SQL は生で書く。Drizzle を通さないのは、`drizzle-orm/d1` の型が
 * グローバルの `D1Database` に依存していて feature 単体の TypeScript
 * プログラムでは解決できないため（`features/auth/server/from-env.ts` と同じ理由）。
 * 代わりに `SqlRunner`（利用側で定義した最小の口）を受け取る。
 *
 * 無料枠の制約（docs/free-tier-budget.md）:
 *   - 一覧の読み取りは **1 クエリ**
 *   - 作成の書き込みは **2 行**（document + document_member）
 *   - 既存メンバーの再訪では **行を書かない**（`ON CONFLICT ... WHERE` で弾く）
 */
import { MAX_DOCUMENTS_PER_USER, MAX_MEMBERS, collectResults, ok } from '@noter/contract'
import type { DocumentId, Result, Role, ShareToken, UserId } from '@noter/contract'
import type {
  Document,
  DocumentAccess,
  DocumentSummary,
  MemberSummary,
  ShareLink,
} from '../contract/document.ts'
import { roleForActor } from '../core/permission.ts'
import {
  parseDocumentRow,
  parseMemberRole,
  parseMemberRow,
  parseShareLinkRow,
  parseSummaryRow,
  readCount,
  toSeconds,
} from './rows.ts'
import type { SqlRunner, SqlStatement, StorageError } from './sql.ts'

/**
 * 役割の強さを SQL の中で比べるための式。`higherRole`（`@noter/contract`）と
 * 同じ順序。1 文で「上げるときだけ書く」を表せるので、読んでから書く往復が要らない。
 */
const rank = (column: string): string =>
  `CASE ${column} WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END`

const DOCUMENT_COLUMNS = 'id, owner_id, kind, title, created_at, updated_at, deleted_at'
const SHARE_LINK_COLUMNS =
  'token, document_id, role, created_by, created_at, expires_at, revoked_at'

const INSERT_DOCUMENT = `INSERT INTO document (${DOCUMENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL)`
const INSERT_OWNER =
  "INSERT INTO document_member (document_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"

/** 文書 1 本 + その人のメンバー行を 1 回の JOIN で取る。 */
const FIND_FOR_ACTOR = `
  SELECT d.id, d.owner_id, d.kind, d.title, d.created_at, d.updated_at, d.deleted_at,
         m.role AS member_role
  FROM document d
  LEFT JOIN document_member m ON m.document_id = d.id AND m.user_id = ?
  WHERE d.id = ?
  LIMIT 1`

/** 一覧はメンバー行から引く（自分が所有していない文書も出る）。 */
const LIST_FOR_USER = `
  SELECT d.id, d.kind, d.title, d.updated_at, m.role
  FROM document_member m
  JOIN document d ON d.id = m.document_id
  WHERE m.user_id = ? AND d.deleted_at IS NULL
  ORDER BY d.updated_at DESC
  LIMIT ?`

const COUNT_OWNED =
  'SELECT COUNT(*) AS total FROM document WHERE owner_id = ? AND deleted_at IS NULL'

const RENAME = 'UPDATE document SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
const SOFT_DELETE =
  'UPDATE document SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'

/** 権限は**上げるときだけ**書く（ADR-0011: 既存メンバーの role を下げない）。 */
const UPSERT_MEMBER = `
  INSERT INTO document_member (document_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role
  WHERE ${rank('excluded.role')} > ${rank('document_member.role')}`

const CHANGE_MEMBER_ROLE =
  'UPDATE document_member SET role = ? WHERE document_id = ? AND user_id = ?'
const REMOVE_MEMBER = 'DELETE FROM document_member WHERE document_id = ? AND user_id = ?'
const COUNT_MEMBERS = 'SELECT COUNT(*) AS total FROM document_member WHERE document_id = ?'

const LIST_MEMBERS = `
  SELECT m.user_id, m.role, u.name AS display_name
  FROM document_member m
  JOIN "user" u ON u.id = m.user_id
  WHERE m.document_id = ?
  ORDER BY ${rank('m.role')} DESC, m.joined_at ASC
  LIMIT ?`

const INSERT_SHARE_LINK = `INSERT INTO share_link (${SHARE_LINK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL)`
const FIND_SHARE_LINK = `SELECT ${SHARE_LINK_COLUMNS} FROM share_link WHERE token = ? LIMIT 1`
const REVOKE_SHARE_LINK =
  'UPDATE share_link SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL'
const LIST_SHARE_LINKS = `
  SELECT ${SHARE_LINK_COLUMNS} FROM share_link
  WHERE document_id = ? AND revoked_at IS NULL
  ORDER BY created_at DESC`

/**
 * 昇格の移譲（ADR-0010）。**4 文を 1 トランザクション**で流す。
 *
 *   1. 両方がメンバーの文書では、移譲先の役割を高い方に揃える
 *   2. 重複した移譲元の行を消す（`user_id` を付け替えると主キーが衝突するため）
 *   3. 残りのメンバー行を付け替える
 *   4. 所有者を付け替える
 *
 * すべて `WHERE ... = from` なので、何度実行しても同じ状態になる。
 */
const TRANSFER_RAISE_ROLE = `
  UPDATE document_member
  SET role = (
    SELECT f.role FROM document_member f
    WHERE f.document_id = document_member.document_id AND f.user_id = ?
  )
  WHERE user_id = ?
    AND EXISTS (
      SELECT 1 FROM document_member f
      WHERE f.document_id = document_member.document_id AND f.user_id = ?
        AND ${rank('f.role')} > ${rank('document_member.role')}
    )`
const TRANSFER_DROP_DUPLICATES = `
  DELETE FROM document_member
  WHERE user_id = ?
    AND EXISTS (
      SELECT 1 FROM document_member t
      WHERE t.document_id = document_member.document_id AND t.user_id = ?
    )`
const TRANSFER_MEMBERS = 'UPDATE document_member SET user_id = ? WHERE user_id = ?'
const TRANSFER_DOCUMENTS = 'UPDATE document SET owner_id = ? WHERE owner_id = ?'

export type DocumentRepository = {
  /** 文書とその所有者メンバー行を 1 トランザクションで作る（2 行）。 */
  readonly create: (document: Document) => Promise<Result<void, StorageError>>
  /** 文書 + この人の役割。非メンバー・削除済み・不明な ID はすべて `undefined`。 */
  readonly findForActor: (
    documentId: DocumentId,
    userId: UserId,
  ) => Promise<Result<DocumentAccess | undefined, StorageError>>
  readonly listForUser: (
    userId: UserId,
  ) => Promise<Result<readonly DocumentSummary[], StorageError>>
  readonly countOwnedByUser: (userId: UserId) => Promise<Result<number, StorageError>>
  readonly rename: (
    documentId: DocumentId,
    title: string,
    now: Date,
  ) => Promise<Result<void, StorageError>>
  readonly softDelete: (documentId: DocumentId, now: Date) => Promise<Result<void, StorageError>>
  /** 書き込んだ行数を返す（0 = 既に同じか強い役割だったので何もしていない）。 */
  readonly upsertMember: (
    documentId: DocumentId,
    userId: UserId,
    role: Role,
    joinedAt: Date,
  ) => Promise<Result<number, StorageError>>
  readonly changeMemberRole: (
    documentId: DocumentId,
    userId: UserId,
    role: Role,
  ) => Promise<Result<void, StorageError>>
  readonly removeMember: (
    documentId: DocumentId,
    userId: UserId,
  ) => Promise<Result<void, StorageError>>
  readonly countMembers: (documentId: DocumentId) => Promise<Result<number, StorageError>>
  readonly listMembers: (
    documentId: DocumentId,
  ) => Promise<Result<readonly MemberSummary[], StorageError>>
  readonly createShareLink: (link: ShareLink) => Promise<Result<void, StorageError>>
  readonly findShareLink: (
    token: ShareToken,
  ) => Promise<Result<ShareLink | undefined, StorageError>>
  readonly revokeShareLink: (token: ShareToken, now: Date) => Promise<Result<void, StorageError>>
  readonly listShareLinks: (
    documentId: DocumentId,
  ) => Promise<Result<readonly ShareLink[], StorageError>>
  /** ゲスト → Google アカウントへの移譲。何度呼んでも同じ結果になる。 */
  readonly transferOwnership: (
    fromUserId: UserId,
    toUserId: UserId,
  ) => Promise<Result<void, StorageError>>
}

const discard = <E>(result: Result<unknown, E>): Result<void, E> =>
  result.ok ? ok(undefined) : result

const statement = (sql: string, params: SqlStatement['params']): SqlStatement => ({ sql, params })

export const makeDocumentRepository = (runner: SqlRunner): DocumentRepository => {
  const create = async (document: Document) =>
    discard(
      await runner.batch([
        statement(INSERT_DOCUMENT, [
          document.id,
          document.ownerId,
          document.kind,
          document.title,
          toSeconds(document.createdAt),
          toSeconds(document.updatedAt),
        ]),
        statement(INSERT_OWNER, [document.id, document.ownerId, toSeconds(document.createdAt)]),
      ]),
    )

  const findForActor = async (
    documentId: DocumentId,
    userId: UserId,
  ): Promise<Result<DocumentAccess | undefined, StorageError>> => {
    const rows = await runner.all(statement(FIND_FOR_ACTOR, [userId, documentId]))
    if (!rows.ok) return rows
    const row = rows.value[0]
    if (row === undefined) return ok(undefined)

    const document = parseDocumentRow(row)
    if (!document.ok) return document

    const memberRole = parseMemberRole(row, 'member_role')
    const role = roleForActor(
      userId,
      document.value,
      memberRole === undefined ? undefined : { userId, role: memberRole },
    )
    return ok(role === undefined ? undefined : { document: document.value, role })
  }

  const listForUser = async (
    userId: UserId,
  ): Promise<Result<readonly DocumentSummary[], StorageError>> => {
    const rows = await runner.all(statement(LIST_FOR_USER, [userId, MAX_DOCUMENTS_PER_USER]))
    if (!rows.ok) return rows

    const parsed = collectResults(rows.value.map(parseSummaryRow))
    if (!parsed.ok) return parsed
    return ok(
      parsed.value.map(({ document, role }) => ({
        id: document.id,
        title: document.title,
        kind: document.kind,
        role,
        updatedAt: document.updatedAt,
      })),
    )
  }

  const countOwnedByUser = async (userId: UserId): Promise<Result<number, StorageError>> => {
    const rows = await runner.all(statement(COUNT_OWNED, [userId]))
    return rows.ok ? ok(readCount(rows.value, 'total')) : rows
  }

  const countMembers = async (documentId: DocumentId): Promise<Result<number, StorageError>> => {
    const rows = await runner.all(statement(COUNT_MEMBERS, [documentId]))
    return rows.ok ? ok(readCount(rows.value, 'total')) : rows
  }

  const listMembers = async (
    documentId: DocumentId,
  ): Promise<Result<readonly MemberSummary[], StorageError>> => {
    const rows = await runner.all(statement(LIST_MEMBERS, [documentId, MAX_MEMBERS]))
    if (!rows.ok) return rows
    return collectResults(rows.value.map(parseMemberRow))
  }

  const findShareLink = async (
    token: ShareToken,
  ): Promise<Result<ShareLink | undefined, StorageError>> => {
    const rows = await runner.all(statement(FIND_SHARE_LINK, [token]))
    if (!rows.ok) return rows
    const row = rows.value[0]
    return row === undefined ? ok(undefined) : parseShareLinkRow(row)
  }

  const listShareLinks = async (
    documentId: DocumentId,
  ): Promise<Result<readonly ShareLink[], StorageError>> => {
    const rows = await runner.all(statement(LIST_SHARE_LINKS, [documentId]))
    if (!rows.ok) return rows
    return collectResults(rows.value.map(parseShareLinkRow))
  }

  return {
    create,
    findForActor,
    listForUser,
    countOwnedByUser,
    countMembers,
    listMembers,
    findShareLink,
    listShareLinks,

    rename: async (documentId, title, now) =>
      discard(await runner.run(statement(RENAME, [title, toSeconds(now), documentId]))),

    softDelete: async (documentId, now) =>
      discard(
        await runner.run(statement(SOFT_DELETE, [toSeconds(now), toSeconds(now), documentId])),
      ),

    upsertMember: async (documentId, userId, role, joinedAt) =>
      runner.run(statement(UPSERT_MEMBER, [documentId, userId, role, toSeconds(joinedAt)])),

    changeMemberRole: async (documentId, userId, role) =>
      discard(await runner.run(statement(CHANGE_MEMBER_ROLE, [role, documentId, userId]))),

    removeMember: async (documentId, userId) =>
      discard(await runner.run(statement(REMOVE_MEMBER, [documentId, userId]))),

    createShareLink: async (link) =>
      discard(
        await runner.run(
          statement(INSERT_SHARE_LINK, [
            link.token,
            link.documentId,
            link.role,
            link.createdBy,
            toSeconds(link.createdAt),
            link.expiresAt === undefined ? null : toSeconds(link.expiresAt),
          ]),
        ),
      ),

    revokeShareLink: async (token, now) =>
      discard(await runner.run(statement(REVOKE_SHARE_LINK, [toSeconds(now), token]))),

    transferOwnership: async (fromUserId, toUserId) =>
      discard(
        await runner.batch([
          statement(TRANSFER_RAISE_ROLE, [fromUserId, toUserId, fromUserId]),
          statement(TRANSFER_DROP_DUPLICATES, [fromUserId, toUserId]),
          statement(TRANSFER_MEMBERS, [toUserId, fromUserId]),
          statement(TRANSFER_DOCUMENTS, [toUserId, fromUserId]),
        ]),
      ),
  }
}
