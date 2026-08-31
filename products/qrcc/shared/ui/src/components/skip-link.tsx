import type { ReactNode } from 'react'

type SkipLinkProps = {
  /** 飛び先の要素 id。その要素には `tabIndex={-1}` を付けておく。 */
  readonly targetId: string
  readonly children?: ReactNode
}

/**
 * 反復するナビゲーションを飛ばすためのリンク（2.4.1）。
 *
 * 画面外に逃がすだけでフォーカス可能なまま残し、フォーカス時に現れる。
 * 文言は単体で行き先が分かるものにする（AAA 2.4.9）。
 */
export const SkipLink = ({ targetId, children = '本文へスキップ' }: SkipLinkProps) => (
  <a className="qrcc-skip-link" href={`#${targetId}`}>
    {children}
  </a>
)
