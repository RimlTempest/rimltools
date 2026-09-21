import type { ElementType, ReactNode } from 'react'

type VisuallyHiddenProps = {
  readonly children: ReactNode
  /** 見出しやラベルとして意味を持たせたいときに要素を差し替える。 */
  readonly as?: ElementType
}

/**
 * 視覚的には隠すが、支援技術には読ませる。
 *
 * `display: none` や `aria-hidden` と違い、読み上げ順に残るのが要点。
 * アイコンだけのボタンに名前を与える、状況説明を補うといった用途に使う。
 */
export const makeVisuallyHidden = (prefix: string) => {
  const VisuallyHidden = ({ children, as: Element = 'span' }: VisuallyHiddenProps) => (
    <Element className={`${prefix}-visually-hidden`}>{children}</Element>
  )
  return VisuallyHidden
}
