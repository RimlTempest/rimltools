/**
 * 文書の操作が断られる理由と、その日本語文言。
 *
 * `kind` に UI 文言を混ぜず、変換をここ 1 か所に集める
 * （`describeShareRoleDenial`（`@noter/auth/contract`）と同じ形）。
 * 文言は docs/design/ux.md §8 に従い「何が起きたか / 影響 / 次にできること」で書く。
 */
import { MAX_DOCUMENTS_PER_USER, MAX_MEMBERS, MAX_TITLE_LENGTH } from '@noter/contract'
import { describeShareRoleDenial } from '@noter/auth/contract'
import type { ShareRoleDenied } from '@noter/auth/contract'

/** 表題が受け付けられない理由。 */
export type TitleError = 'empty' | 'too_long'

/** 共有リンクが使えない理由。 */
export type ShareLinkUnusable = 'not_found' | 'revoked' | 'expired'

export type DocumentError =
  /** セッションが無い。文書は作れず、開けもしない。 */
  | { readonly kind: 'sign_in_required' }
  /** 無い / 消された / この人はメンバーでない。存在の有無も区別しない。 */
  | { readonly kind: 'not_found' }
  /** メンバーではあるが、その操作をする権限が無い。 */
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'invalid_title'; readonly reason: TitleError }
  | { readonly kind: 'document_limit' }
  | { readonly kind: 'member_limit' }
  | { readonly kind: 'share_role_denied'; readonly denied: ShareRoleDenied }
  | { readonly kind: 'link_unusable'; readonly reason: ShareLinkUnusable }
  /** 所有者は自分を外せない（外すと誰も管理できなくなる）。 */
  | { readonly kind: 'owner_cannot_leave' }
  | { readonly kind: 'storage_unavailable'; readonly detail: string }

const describeTitleError = (reason: TitleError): string =>
  reason === 'empty'
    ? '表題を入力してください。'
    : `表題は ${MAX_TITLE_LENGTH} 文字以内で入力してください。`

export const describeDocumentError = (error: DocumentError): string => {
  switch (error.kind) {
    case 'sign_in_required':
      return 'この操作にはセッションが必要です。ページを再読み込みしてからやり直してください。'
    case 'not_found':
      return 'この文書は見つかりません。削除されたか、共有が解除された可能性があります。'
    case 'forbidden':
      return 'この操作を行う権限がありません。文書の所有者に依頼してください。'
    case 'invalid_title':
      return describeTitleError(error.reason)
    case 'document_limit':
      return `文書は 1 アカウントあたり ${MAX_DOCUMENTS_PER_USER} 本までです。使わない文書を削除してから作成してください。`
    case 'member_limit':
      return `参加者は 1 文書あたり ${MAX_MEMBERS} 人までです。参加していない人を外してから招待してください。`
    case 'share_role_denied':
      return describeShareRoleDenial(error.denied)
    case 'link_unusable':
      return 'このリンクは無効です。作成者に新しいリンクを依頼してください。'
    case 'owner_cannot_leave':
      return '所有者はこの文書から退出できません。文書ごと削除するか、共有を解除してください。'
    case 'storage_unavailable':
      return 'いま保存先に接続できません。しばらくしてからもう一度お試しください。'
  }
}
