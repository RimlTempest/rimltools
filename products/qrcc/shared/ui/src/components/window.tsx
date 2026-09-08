import { useId, useState, type ReactNode } from 'react'

const WINDOW_TONE = {
  accent: 'accent',
  warning: 'warning',
  danger: 'danger',
} as const

export type WindowTone = (typeof WINDOW_TONE)[keyof typeof WINDOW_TONE]

/** たたむ（−）の丸。開閉の状態は帯の外（窓・ダイアログ）が持つ */
type WindowCollapse = {
  readonly expanded: boolean
  /** 開け閉めされる本文の id。ボタンの aria-controls がこれを指す */
  readonly controlsId: string
  readonly onToggle: () => void
}

type WindowBarProps = {
  /** 帯の文言。そのまま窓のアクセシブル名になる */
  readonly title: ReactNode
  /** 見出しに付ける id。窓の aria-labelledby がこれを指す */
  readonly titleId: string
  /** 見出しの段。ページの見出し構造に合わせる（既定 2） */
  readonly headingLevel?: 2 | 3 | 4
  /** 帯の色。既定は灰茶色（chrome）。danger は破壊的操作の窓だけ */
  readonly tone?: WindowTone | undefined
  /** 渡すと閉じる（×）の丸を描く。渡さなければ描かない */
  readonly onClose?: (() => void) | undefined
  /** 渡すと たたむ（−）の丸を描く。渡さなければ描かない */
  readonly collapse?: WindowCollapse | undefined
}

/**
 * 窓の帯（riml-ds ADR-0014 / docs/brand.md §7.1）。
 * 帯 ⊃ 操作 + 見出し で、トーン（帯の色）は **帯（header）側の data-tone** が受ける。
 *
 * 左端の丸は装飾ではなく本物のボタン。並びは左から 閉じる（×）・広げる（□）・たたむ（−）で、
 * 使わない操作の丸は**描かない**（qrcc では「広げる」を使わないので props も持たない）。
 * 記号（× / −）は riml-ds の patterns.css が mask で描くので、ボタンの中身は空でよい。
 *
 * ダイアログも同じ帯を着る。3 つ目の利用側が出ても帯は @qrcc/ui の中に留め、
 * feature 側で header を手で組まない。
 */
export const WindowBar = ({
  title,
  titleId,
  headingLevel = 2,
  tone,
  onClose,
  collapse,
}: WindowBarProps) => {
  const Heading = `h${headingLevel}` satisfies 'h2' | 'h3' | 'h4'
  const hasControls = onClose !== undefined || collapse !== undefined
  return (
    <header className="rd-window-bar" data-tone={tone}>
      {hasControls ? (
        <div className="rd-window-controls">
          {onClose === undefined ? undefined : (
            <button
              type="button"
              className="rd-window-control"
              data-action="close"
              aria-label="閉じる"
              onClick={onClose}
            />
          )}
          {collapse === undefined ? undefined : (
            // たたんだ状態でもラベルは「たたむ」のまま。状態は aria-expanded が伝える
            <button
              type="button"
              className="rd-window-control"
              data-action="collapse"
              aria-label="たたむ"
              aria-expanded={collapse.expanded}
              aria-controls={collapse.controlsId}
              onClick={collapse.onToggle}
            />
          )}
        </div>
      ) : undefined}
      <Heading className="rd-window-title" id={titleId}>
        {title}
      </Heading>
    </header>
  )
}

type WindowProps = {
  /** タイトル帯の文言。そのまま region のアクセシブル名になる */
  readonly title: ReactNode
  /** 見出しの段。ページの見出し構造に合わせる（既定 2） */
  readonly headingLevel?: 2 | 3 | 4
  /** 帯の色。既定は灰茶色（chrome）。danger は破壊的操作の窓だけ */
  readonly tone?: WindowTone
  readonly id?: string
  /** 渡すと帯に閉じる（×）の丸が出る。閉じたあとの後始末は呼び出し側の仕事 */
  readonly onClose?: () => void
  /** 帯に たたむ（−）の丸を出す。開閉の状態はこの窓が持つ（既定は開いている） */
  readonly collapsible?: boolean
  readonly children: ReactNode
}

/**
 * 窓（Mado）。riml-ds の `.rd-window`（@rimltempest/riml-ds-css/patterns.css）をそのまま使う。
 * 構造は 帯（header）⊃ 操作 + 見出し ／ 本文 で、トーン（帯の色）は帯側の data-tone が受ける。
 * 長い題を 1 行で切りたいときは title を <span> で渡す（素のテキストには text-overflow が効かない）。
 * `<section aria-labelledby>` なので支援技術には「region: <題>」として見える。
 * 題の無い箱が要るなら Window ではなく普通の div を使う（帯だけの窓は作らない）。
 *
 * たたんだ状態は URL にもストレージにも残さない（画面を開き直せば開いている）。
 */
export const Window = ({
  title,
  headingLevel = 2,
  tone,
  id,
  onClose,
  collapsible = false,
  children,
}: WindowProps) => {
  const titleId = useId()
  const bodyId = useId()
  const [expanded, setExpanded] = useState(true)
  return (
    <section className="rd-window" id={id} aria-labelledby={titleId}>
      <WindowBar
        title={title}
        titleId={titleId}
        headingLevel={headingLevel}
        tone={tone}
        onClose={onClose}
        collapse={
          collapsible
            ? {
                expanded,
                controlsId: bodyId,
                onToggle: () => setExpanded((open) => !open),
              }
            : undefined
        }
      />
      <div className="rd-window-body" id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
