/**
 * 「いま誰がアプリを使っているか」。
 *
 * 生成と読み取りは**ログインなしでも使える**のが前提で、
 * 保存・一覧・共有だけが所有者を要求する（ADR-0004）。
 * その線引きを型に出し、画面が「ログインしてください」を出す場所を 1 つにする。
 */
import type { UserId } from '@qrcc/contract'

export type Actor =
  /** まだサインインしていない。生成と読み取りだけができる。 */
  | { readonly kind: 'visitor' }
  /** ゲスト（匿名）。30 日でセッションごと消える。 */
  | {
      readonly kind: 'guest'
      readonly userId: UserId
      readonly displayName: string
      readonly sessionExpiresAt: Date
    }
  /** Google でサインイン済み。 */
  | { readonly kind: 'user'; readonly userId: UserId; readonly displayName: string }

/**
 * アプリの機能をログインの要否で分類したもの。
 * 機能を足したら `REQUIRES_SIGN_IN` にも足さないとコンパイルエラーになる（OCP）。
 */
export const CAPABILITIES = ['generate', 'scan', 'save', 'list', 'share'] as const

export type Capability = (typeof CAPABILITIES)[number]

/** Mapped Type のレジストリ。追加漏れが型で止まる。 */
const REQUIRES_SIGN_IN: { readonly [K in Capability]: boolean } = {
  // Worker を消費せず端末側で動くので、そもそも所有者が要らない
  generate: false,
  scan: false,
  // 所有者がいないと保存先が決まらない
  save: true,
  list: true,
  share: true,
}

export const isSignedIn = (actor: Actor): boolean => actor.kind !== 'visitor'

export const canUse = (actor: Actor, capability: Capability): boolean =>
  !REQUIRES_SIGN_IN[capability] || isSignedIn(actor)

/**
 * qrcc-api に渡す `actor`（ADR-0002）。
 *
 * 未ログインでは `undefined` になり、RPC のヘッダ自体が付かない。
 * ここを通った値だけが「検証済みの UserId」として境界を越える。
 */
export const actorUserId = (actor: Actor): UserId | undefined =>
  actor.kind === 'visitor' ? undefined : actor.userId
