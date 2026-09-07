import { useId, type ReactNode } from 'react'

const WINDOW_TONE = {
  accent: 'accent',
  warning: 'warning',
  danger: 'danger',
} as const

export type WindowTone = (typeof WINDOW_TONE)[keyof typeof WINDOW_TONE]

type WindowProps = {
  /** タイトル帯の文言。そのまま region のアクセシブル名になる */
  readonly title: ReactNode
  /** 見出しの段。ページの見出し構造に合わせる（既定 2） */
  readonly headingLevel?: 2 | 3 | 4
  /** 帯の色。既定は灰茶色（chrome）。danger は破壊的操作の窓だけ */
  readonly tone?: WindowTone
  readonly id?: string
  readonly children: ReactNode
}

/**
 * 窓（Mado）。riml-ds の `.rd-window`（@rimltempest/riml-ds-css/patterns.css）をそのまま使う。
 * トーン（帯の色）は riml-ds の決まりで見出し側の data-tone が受ける。
 * 長い題を 1 行で切りたいときは title を <span> で渡す（素のテキストには text-overflow が効かない）。
 * `<section aria-labelledby>` なので支援技術には「region: <題>」として見える。
 * 題の無い箱が要るなら Window ではなく普通の div を使う（帯だけの窓は作らない）。
 */
export const Window = ({ title, headingLevel = 2, tone, id, children }: WindowProps) => {
  const titleId = useId()
  const Heading = `h${headingLevel}` satisfies 'h2' | 'h3' | 'h4'
  return (
    <section className="rd-window" id={id} aria-labelledby={titleId}>
      <Heading className="rd-window-title" id={titleId} data-tone={tone}>
        {title}
      </Heading>
      <div className="rd-window-body">{children}</div>
    </section>
  )
}
