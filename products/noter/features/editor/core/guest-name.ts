/**
 * ゲストの表示名（docs/design/ux.md §6.2）。
 *
 * 共有リンクで入った人は全員「ゲスト」という同じ名前を持っている
 * （`generateName` の既定）。そのままでは参加者一覧もカーソルのラベルも
 * 区別が付かないので、初回だけ名前を聞き、既定として重複しない候補を出す。
 */
import type { Actor } from '@noter/auth/contract'
import { fnv1a } from './hash.ts'

/**
 * サーバがゲストに付ける既定の名前（`@noter/auth/server` の `GUEST_DISPLAY_NAME`）。
 * サーバ側の実装を UI から import しないので、値だけをここに写している。
 * 一致しなくなっても「名前を聞く回数が変わる」だけで、壊れはしない。
 */
const UNNAMED_GUEST = 'ゲスト'

/** `ゲスト-1a2b`。同じ人には常に同じ候補を出す（聞き直しても案が変わらない）。 */
export const guestDisplayName = (seed: string): string =>
  `ゲスト-${fnv1a(seed).toString(36).padStart(4, '0').slice(-4)}`

/**
 * 名前を聞くべきか。
 *
 * 聞くのは**人の文書に参加したとき**だけ（ux.md §6.2）。自分で作った文書を
 * 開いただけの人には聞かない — 「開いた瞬間に書ける」（§6.1 / §2 原則 1）の
 * 前に問いを挟まない。
 *
 * 一度この端末で決めていれば聞かない（AAA 3.3.7 冗長な入力）。
 * 自分で名前を付けたゲストにも聞かない。
 */
export const shouldPromptName = (
  actor: Actor,
  storedName: string | undefined,
  /** 人の文書に参加して開いているか（= 所有者ではない）。 */
  joined: boolean,
): boolean => {
  if (!joined) return false
  if (actor.kind !== 'guest') return false
  if (storedName !== undefined && storedName !== '') return false
  return actor.displayName === '' || actor.displayName === UNNAMED_GUEST
}
