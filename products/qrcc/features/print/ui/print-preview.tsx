/*
 * 印刷プレビュー。
 *
 * 台紙は物理寸法（A4 = 210mm）なので、狭い画面ではこの領域だけが
 * 横スクロールする（ページ全体を横に伸ばさない。WCAG 1.4.10）。
 * スクロールできる領域はキーボードでも動かせなければならないので
 * （WCAG 2.1.1 / axe の scrollable-region-focusable）、
 * この section 自身をフォーカス可能にしている。
 *
 * jsx-a11y の no-noninteractive-tabindex は「対話的でない要素に tabindex を
 * 付けるな」と言うが、スクロール領域はその既知の例外で、外すと axe が違反を
 * 出す。2 つの自動検査が衝突するため、実利用者の要件（キーボードで
 * 中身を送れること）を優先し、この 1 ファイルに限って規則を無効にする。
 */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */
import type { RenderResponse } from '@qrcc/generate/contract'
import type { Caption, ImposedPage, LabelSheet } from '../contract/index.ts'
import { LabelSheetPreview } from './label-sheet.tsx'

type PrintPreviewProps = {
  readonly sheet: LabelSheet
  readonly pages: readonly ImposedPage[]
  readonly caption: Caption
  readonly symbols: ReadonlyMap<string, RenderResponse>
  /** 台紙 1 枚の面数。見出しで「24 面中 20 面を使用」と伝えるために使う。 */
  readonly cellsPerSheet: number
  /** 見出しの id。呼び出し側が `aria-labelledby` に使う。 */
  readonly headingId: string
}

export const PrintPreview = ({
  sheet,
  pages,
  caption,
  symbols,
  cellsPerSheet,
  headingId,
}: PrintPreviewProps) => (
  <section className="qrcc-print-preview" aria-labelledby={headingId} tabIndex={0}>
    <h2 className="qrcc-no-print" id={headingId}>
      印刷プレビュー
    </h2>
    {pages.map((page) => (
      <section key={page.pageNumber}>
        <h3 className="qrcc-no-print">
          {page.pageNumber} 枚目の台紙（{cellsPerSheet} 面中 {page.usedCells} 面を使用）
        </h3>
        <LabelSheetPreview sheet={sheet} page={page} caption={caption} symbols={symbols} />
      </section>
    ))}
  </section>
)
