/**
 * 共有リンクが「いま使えるか」の判定と、有効期限の決め方（ADR-0011）。
 *
 * 時計は引数で受け取る。ここは I/O を持たない。
 */
import { SHARE_LINK_MAX_AGE_MS, err, ok } from '@noter/contract'
import type { Result } from '@noter/contract'
import type { ShareLink } from '../contract/document.ts'

/** 使えない理由。画面の文言はこの 3 つを 1 つの説明に畳む（UX §4.3）。 */
export type ShareLinkUnusable = 'not_found' | 'revoked' | 'expired'

const DAY_MS = 24 * 60 * 60 * 1000

/** 画面に出す有効期限の選択肢（日）。無期限は別枠で選ぶ。 */
export const SHARE_LINK_DAY_CHOICES: readonly number[] = [7, 30, 90]

/**
 * 使えるリンクなら値として返す。存在しないトークンも「使えない」の一種として
 * ここで扱い、呼び出し側の分岐を 1 か所にまとめる。
 *
 * 失効と期限切れが重なったときは失効を先に返す。owner が明示的に止めたことが
 * 「たまたま期限が来た」より説明として正確なため。
 */
export const isShareLinkUsable = (
  link: ShareLink | undefined,
  now: Date,
): Result<ShareLink, ShareLinkUnusable> => {
  if (link === undefined) return err('not_found')
  if (link.revokedAt !== undefined) return err('revoked')
  if (link.expiresAt !== undefined && link.expiresAt.getTime() <= now.getTime()) {
    return err('expired')
  }
  return ok(link)
}

/** 既定の有効期限（90 日後）。 */
export const defaultExpiry = (now: Date): Date => new Date(now.getTime() + SHARE_LINK_MAX_AGE_MS)

/** 日数指定から期限を作る。`undefined` は無期限（owner の明示選択）。 */
export const expiryFromDays = (now: Date, days: number | undefined): Date | undefined =>
  days === undefined ? undefined : new Date(now.getTime() + days * DAY_MS)
