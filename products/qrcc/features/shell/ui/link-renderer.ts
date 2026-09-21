import type { ReactNode } from 'react'

/**
 * リンクの描画方法。既定は素の `<a>`。
 *
 * ルータをコンポーネントに直接 import すると、テストのたびに
 * RouterProvider が要るうえ、`@qrcc/shell` がルータに縛られる。
 * 描画方法を引数で受け取ることで両方を避けている（関数DI）。
 */
export type NavLinkRenderer = (props: {
  readonly to: string
  readonly label: string
  readonly isCurrent: boolean
}) => ReactNode
