/**
 * 「この役割はこの操作をしてよいか」の唯一の表（docs/domain-model.md §権限表、ADR-0011）。
 *
 * web Worker の server function / `/ws/` の認可と、Durable Object の受信フィルタが
 * **同じ関数**を使う。片方だけ直して判断がずれることを構造的に防ぐ。
 *
 * 表は Mapped Type なので、`Role` か `Action` を足すとセルの書き忘れが
 * コンパイルエラーになる。
 */
import type { Role, UserId } from '@noter/contract'

export const ACTIONS = [
  'read',
  'edit',
  'presence',
  'rename',
  'share',
  'remove_member',
  'delete',
  'export_raw',
] as const

export type Action = (typeof ACTIONS)[number]

const TABLE: { readonly [R in Role]: { readonly [A in Action]: boolean } } = {
  owner: {
    read: true,
    edit: true,
    presence: true,
    rename: true,
    share: true,
    remove_member: true,
    delete: true,
    export_raw: true,
  },
  editor: {
    read: true,
    edit: true,
    presence: true,
    rename: true,
    share: false,
    remove_member: false,
    delete: false,
    export_raw: true,
  },
  /** 閲覧者の presence は**受信のみ**。覗き見感を出さないため送信させない。 */
  viewer: {
    read: true,
    edit: false,
    presence: false,
    rename: false,
    share: false,
    remove_member: false,
    delete: false,
    export_raw: true,
  },
}

export const can = (role: Role, action: Action): boolean => TABLE[role][action]

/** 判定に必要な文書の情報だけ。行を丸ごと要求しないので、テストで組み立てやすい。 */
export type OwnedDocument = {
  readonly ownerId: UserId
  readonly deletedAt: Date | undefined
}

/** メンバー行のうち役割の判定に使う部分だけ。 */
export type MemberRow = {
  readonly userId: UserId
  readonly role: Role
}

/**
 * この人がこの文書に対して持つ役割。持たないなら `undefined`（= 非メンバー）。
 *
 * 所有者は `document_member` の行が無くても owner として扱う。
 * 削除済みの文書は誰も役割を持たない（一覧非表示・`/d/` 404・WS 4404）。
 */
export const roleForActor = (
  actorId: UserId,
  document: OwnedDocument,
  member: MemberRow | undefined,
): Role | undefined => {
  if (document.deletedAt !== undefined) return undefined
  if (document.ownerId === actorId) return 'owner'
  return member?.userId === actorId ? member.role : undefined
}
