/**
 * 共有リンクにどの権限を載せられるかの判定（ADR-0010 / ADR-0011）。
 *
 * ADR-0011 の決め事:
 *   - 共有リンクの role は `viewer` / `editor` の 2 択（`owner` リンクは無い）
 *   - **ゲスト（匿名）の owner は `viewer` リンクしか作れない**
 *
 * 共有ダイアログ（何を選べるか）とリンク発行の server function（本当に
 * 発行してよいか）が**同じ関数**を使う。片方だけ直して権限が漏れる、を防ぐ。
 */
import type { Role } from '@noter/contract'
import type { Actor } from './actor.ts'

/** 共有リンクに載せられる role。`owner` はリンクでは渡せない。 */
export type ShareRole = Exclude<Role, 'owner'>

/** 強い順ではなく、画面に並べる順。 */
export const SHARE_ROLES: readonly ShareRole[] = ['viewer', 'editor']

/** ゲスト owner が発行できる共有リンクの role。editor リンクは Google 連携後のみ。 */
export const allowedShareRoles = (actor: Actor): readonly ShareRole[] =>
  actor.kind === 'user' ? ['viewer', 'editor'] : actor.kind === 'guest' ? ['viewer'] : []

export const canGrantShareRole = (actor: Actor, role: ShareRole): boolean =>
  allowedShareRoles(actor).includes(role)

export type ShareRoleDenied =
  | { readonly kind: 'sign_in_required' }
  | { readonly kind: 'guest_cannot_grant_editor' }

/**
 * 断る理由。`canGrantShareRole` が false のときだけ意味を持つ。
 * 判定と理由づけを分けているのは、判定を 1 行の述語に保つため。
 */
export const shareRoleDenial = (actor: Actor, role: ShareRole): ShareRoleDenied | undefined => {
  if (canGrantShareRole(actor, role)) return undefined
  return actor.kind === 'visitor'
    ? { kind: 'sign_in_required' }
    : { kind: 'guest_cannot_grant_editor' }
}

/** 断られた理由を画面の文言にする。`kind` に UI 文言を混ぜないための変換点。 */
export const describeShareRoleDenial = (denied: ShareRoleDenied): string => {
  switch (denied.kind) {
    case 'sign_in_required':
      return '共有リンクを作るには、ゲストのまま続けるか Google でログインしてください。'
    case 'guest_cannot_grant_editor':
      return 'ゲストのままでは編集できる共有リンクを作れません。Google でログインすると作れるようになります。文書はそのまま引き継がれます。'
  }
}
