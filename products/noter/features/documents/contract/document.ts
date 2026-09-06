/**
 * 文書・参加者・共有リンクの形（docs/domain-model.md §用語）。
 *
 * 本文はここに無い。テキストは Durable Object が持ち、D1 に置くのは
 * 「誰が・どの文書に・どの権限で」を決めるためのメタ情報だけ（ADR-0011）。
 *
 * 日時は `Date` で持つ。D1 の列は Unix 秒（INTEGER）で、変換は
 * `features/documents/server` の行パーサだけが行う。
 */
import type { DocumentId, DocumentKind, Role, ShareToken, UserId } from '@noter/contract'
import type { ShareRole } from '@noter/auth/contract'

export type Document = {
  readonly id: DocumentId
  readonly ownerId: UserId
  readonly kind: DocumentKind
  readonly title: string
  readonly createdAt: Date
  readonly updatedAt: Date
  /** soft delete の時刻。入っている間は一覧に出ず、`/d/:id` は 404（`docs/domain-model.md`）。 */
  readonly deletedAt: Date | undefined
}

export type DocumentMember = {
  readonly documentId: DocumentId
  readonly userId: UserId
  readonly role: Role
  readonly joinedAt: Date
}

/** 共有ダイアログの参加者一覧に出す 1 行。表示名は `user` テーブルから引く。 */
export type MemberSummary = {
  readonly userId: UserId
  readonly displayName: string
  readonly role: Role
}

/**
 * 共有リンク。**権限そのものではなく、メンバーになるための入口**（ADR-0011）。
 * `expiresAt` が無いリンクは無期限（owner が明示的に選んだときだけ）。
 */
export type ShareLink = {
  readonly token: ShareToken
  readonly documentId: DocumentId
  readonly role: ShareRole
  readonly createdBy: UserId
  readonly createdAt: Date
  readonly expiresAt: Date | undefined
  readonly revokedAt: Date | undefined
}

/** ホームの一覧 1 行ぶん。一覧に要らない列は読まない（D1 の読み取りを増やさない）。 */
export type DocumentSummary = {
  readonly id: DocumentId
  readonly title: string
  readonly kind: DocumentKind
  readonly role: Role
  readonly updatedAt: Date
}

/** 文書 1 本に対する「この人の見え方」。エディタ画面と `/ws/` の認可が使う。 */
export type DocumentAccess = {
  readonly document: Document
  readonly role: Role
}
