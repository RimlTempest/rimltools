import type { NavLinkRenderer } from '@noter/shell/ui'

type ShareEntryScreenProps = {
  readonly renderLink?: NavLinkRenderer
}

const defaultRenderLink: NavLinkRenderer = ({ to, label }) => <a href={to}>{label}</a>

/**
 * 共有リンクが使えなかったときの画面（docs/design/ux.md §4.3）。
 *
 * 有効なリンクではここまで来ない（`/d/:id` へ 302 する）。
 * **理由は区別しない。** 「失効した」「期限切れ」「そんなトークンは無い」を
 * 出し分けると、トークンの存在をリンクの持ち主以外にも教えてしまう。
 */
export const ShareEntryScreen = ({ renderLink = defaultRenderLink }: ShareEntryScreenProps) => (
  <>
    <h1>共有リンク</h1>
    <p>このリンクは無効です。作成者に新しいリンクを依頼してください。</p>
    <p>{renderLink({ to: '/', label: '文書一覧へ戻る', isCurrent: false })}</p>
  </>
)
