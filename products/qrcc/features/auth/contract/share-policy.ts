/**
 * 共有リンクを発行してよいかの判定（ADR-0004 / docs/domain-model.md）。
 *
 * ゲストは **編集権限**の共有リンクも**無期限**の共有リンクも作れない。
 * 共有機能そのものは別レーン（feat/manage）だが、この制約は認証の決め事なので
 * ここで型と関数にしておき、実装側が破れないようにする。
 *
 * `ShareLinkGrant` は `authorizeShareLink` を通らないと作れない（Branded）。
 * 「判定を忘れて共有リンクを発行する」がコンパイルエラーになる。
 */
import type { Brand, Result, UserId } from '@qrcc/contract'
import { makeParser } from '@qrcc/contract'
import type { Actor } from './actor.ts'

export type SharePermission = 'view' | 'edit'

export type ShareExpiry =
  | { readonly kind: 'days'; readonly days: number }
  | { readonly kind: 'forever' }

export type ShareLinkRequest = {
  readonly permission: SharePermission
  readonly expiry: ShareExpiry
}

type ShareLinkSettings = {
  readonly ownerId: UserId
  readonly permission: SharePermission
  /** `undefined` は無期限。ゲストは選べない。 */
  readonly expiresAt: Date | undefined
  readonly issuedByGuest: boolean
}

export type ShareLinkGrant = Brand<ShareLinkSettings, 'ShareLinkGrant'>

export type ShareLinkDenied =
  | { readonly kind: 'sign_in_required' }
  | { readonly kind: 'guest_cannot_grant_edit' }
  | { readonly kind: 'guest_cannot_share_forever' }
  | { readonly kind: 'expiry_out_of_range'; readonly max: number; readonly actual: number }

/** 既定の有効期限（日）。 */
export const SHARE_DAYS_DEFAULT = 30
/** 有効期限の上限（日）。 */
export const MAX_SHARE_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 最後の関門。理由づけは下の `authorizeShareLink` が先に行うので、
 * ここは「ゲストの制約が本当に守られているか」だけを値から見て確かめる。
 * 判定を 2 段にしているのは、理由を細かく返しつつ、
 * 生成点を 1 つに閉じるため（型を作れるのはこのパーサだけ）。
 */
const grantParser = makeParser(
  (settings: ShareLinkSettings): settings is ShareLinkGrant =>
    !settings.issuedByGuest || (settings.permission === 'view' && settings.expiresAt !== undefined),
  (settings): ShareLinkDenied =>
    settings.permission === 'edit'
      ? { kind: 'guest_cannot_grant_edit' }
      : { kind: 'guest_cannot_share_forever' },
)

const expiresAtOf = (now: Date, expiry: ShareExpiry): Date | undefined =>
  expiry.kind === 'forever' ? undefined : new Date(now.getTime() + expiry.days * DAY_MS)

/**
 * 依存（時計）→ 入力 → 結果 の 2 段カリー化。
 * テストでは固定した時刻を渡す。
 */
export const authorizeShareLink =
  (now: () => Date) =>
  (actor: Actor, request: ShareLinkRequest): Result<ShareLinkGrant, ShareLinkDenied> => {
    if (actor.kind === 'visitor') {
      return { ok: false, error: { kind: 'sign_in_required' } }
    }
    const isGuest = actor.kind === 'guest'
    if (isGuest && request.permission === 'edit') {
      return { ok: false, error: { kind: 'guest_cannot_grant_edit' } }
    }
    if (isGuest && request.expiry.kind === 'forever') {
      return { ok: false, error: { kind: 'guest_cannot_share_forever' } }
    }
    if (
      request.expiry.kind === 'days'
      && (request.expiry.days < 1 || request.expiry.days > MAX_SHARE_DAYS)
    ) {
      return {
        ok: false,
        error: { kind: 'expiry_out_of_range', max: MAX_SHARE_DAYS, actual: request.expiry.days },
      }
    }
    return grantParser({
      ownerId: actor.userId,
      permission: request.permission,
      expiresAt: expiresAtOf(now(), request.expiry),
      issuedByGuest: isGuest,
    })
  }

/** 断られた理由を画面の文言にする。`kind` に UI 文言を混ぜないための変換点。 */
export const describeShareDenial = (denied: ShareLinkDenied): string => {
  switch (denied.kind) {
    case 'sign_in_required':
      return '共有リンクを作るにはサインインが必要です。'
    case 'guest_cannot_grant_edit':
      return 'ゲストのままでは編集できる共有リンクを作れません。Google で続けると作れるようになります。'
    case 'guest_cannot_share_forever':
      return `ゲストのままでは期限なしの共有リンクを作れません。${MAX_SHARE_DAYS} 日以内の期限を選んでください。`
    case 'expiry_out_of_range':
      return `共有リンクの期限は 1 日以上 ${denied.max} 日以内で指定してください（指定: ${denied.actual} 日）。`
  }
}
