import type { ReactNode } from 'react'
import type { Actor } from '../contract/actor.ts'

/**
 * リンクの描画方法。既定は素の `<a>`。
 * ルータを直接 import しないので、この表示はルータなしでテストできる。
 */
export type AuthLinkRenderer = (props: { readonly to: string; readonly label: string }) => ReactNode

type AuthStatusProps = {
  readonly actor: Actor
  readonly renderLink?: AuthLinkRenderer
}

const defaultRenderLink: AuthLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>

/**
 * ヘッダー右の「いま誰として使っているか」。
 *
 * 常駐する表示なので live region にしない（画面遷移のたびに読み上げられ、
 * ページ側の通知と competing する）。状態の変化を伝えるのはログイン画面の
 * `LiveRegion` の仕事。
 *
 * ゲストには「ゲスト」であることを必ず見せる。黙って 30 日で消えるのが
 * 一番困るので、詳しい期限はアカウント設定へ導線を出して伝える。
 */
export const AuthStatus = ({ actor, renderLink = defaultRenderLink }: AuthStatusProps) => (
  <p className="noter-auth-status">
    <span className="noter-auth-status__who">
      {actor.kind === 'visitor' ? 'ログインしていません' : actor.displayName}
    </span>
    {actor.kind === 'visitor'
      ? renderLink({ to: '/sign-in', label: 'ログイン' })
      : renderLink({ to: '/settings/account', label: 'アカウント設定' })}
  </p>
)
