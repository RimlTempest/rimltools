import type { NavLinkRenderer } from './link-renderer.ts'

type HomeScreenProps = {
  readonly renderLink?: NavLinkRenderer
}

const defaultRenderLink: NavLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>

/**
 * ホーム（文書一覧）。
 *
 * いまは足場だけで、実際の一覧は plan 004（`features/documents`）が入れる。
 * それまでも「ここに何が出るか」「次に何をすればよいか」が読めるようにしておく
 * （空の画面に何も書かないと、壊れているのか空なのか区別が付かない）。
 */
export const HomeScreen = ({ renderLink = defaultRenderLink }: HomeScreenProps) => (
  <>
    <h1>文書一覧</h1>
    <p>まだ文書がありません。</p>
    <p className="noter-home__action">
      {renderLink({ to: '/new', label: '新しい文書を作る', isCurrent: false })}
    </p>
  </>
)
