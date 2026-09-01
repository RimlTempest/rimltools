import type { Actor } from '../contract/actor.ts'

/**
 * リンクの描画方法。既定は素の `<a>`。
 * ルータを直接 import しないので、この画面はルータなしでテストできる。
 */
export type SignInLinkRenderer = (props: {
  readonly to: string
  readonly label: string
}) => React.ReactNode

type AuthStatusProps = {
  readonly actor: Actor
  readonly renderLink?: SignInLinkRenderer
}

const defaultRenderLink: SignInLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(date)

/**
 * いまのサインイン状態。
 *
 * `<output>`（暗黙に role="status"）なので、サインイン・サインアウトの結果が
 * 画面を見ていない人にも伝わる。ゲストには**いつまで使えるか**を必ず添える
 * （黙って消えるのが一番困る）。
 */
export const AuthStatus = ({ actor, renderLink = defaultRenderLink }: AuthStatusProps) => (
  // <output> は暗黙に role="status" を持つ。role を後付けするより素直（ARIA 第一法則）
  <output className="qrcc-auth-status">
    {actor.kind === 'visitor' ? (
      <>
        <span>サインインしていません。生成と読み取りはこのまま使えます。</span>{' '}
        {renderLink({ to: '/sign-in', label: 'サインインする' })}
      </>
    ) : undefined}
    {actor.kind === 'guest' ? (
      <>
        <span>
          ゲストとして利用中です。このデータは {formatDate(actor.sessionExpiresAt)} まで残ります。
        </span>{' '}
        {renderLink({ to: '/sign-in', label: 'サインインの設定を見る' })}
      </>
    ) : undefined}
    {actor.kind === 'user' ? (
      <>
        <span>{actor.displayName} さんとしてサインイン中です。</span>{' '}
        {renderLink({ to: '/sign-in', label: 'サインインの設定を見る' })}
      </>
    ) : undefined}
  </output>
)
