/**
 * 台紙の寸法を CSS カスタムプロパティに写す。
 *
 * **ここが台紙定義と印刷 CSS の唯一の接点。** CSS 側は
 * `var(--qrcc-cell-inline)` のように参照するだけで、寸法の数値を持たない
 * （ADR-0005 の帰結: 寸法を二重管理しない）。
 *
 * 値を作るだけで DOM も CSSOM も触らないので、ここは純粋ロジックに置ける。
 */
import type { LabelSheet } from '../contract/index.ts'

/**
 * 印刷 CSS が読むカスタムプロパティ。
 * 鍵を明示的に並べるのは、CSS 側の名前と対応が取れているかを型で見るため。
 */
export type SheetCustomProperties = {
  readonly '--qrcc-sheet-page-inline': string
  readonly '--qrcc-sheet-page-block': string
  readonly '--qrcc-sheet-margin-block-start': string
  readonly '--qrcc-sheet-margin-inline-end': string
  readonly '--qrcc-sheet-margin-block-end': string
  readonly '--qrcc-sheet-margin-inline-start': string
  readonly '--qrcc-sheet-columns': string
  readonly '--qrcc-sheet-rows': string
  readonly '--qrcc-cell-inline': string
  readonly '--qrcc-cell-block': string
  readonly '--qrcc-cell-gap-inline': string
  readonly '--qrcc-cell-gap-block': string
}

const mm = (value: number): string => `${value}mm`

export const sheetCustomProperties = (sheet: LabelSheet): SheetCustomProperties => ({
  '--qrcc-sheet-page-inline': mm(sheet.page.width),
  '--qrcc-sheet-page-block': mm(sheet.page.height),
  '--qrcc-sheet-margin-block-start': mm(sheet.margin.top),
  '--qrcc-sheet-margin-inline-end': mm(sheet.margin.right),
  '--qrcc-sheet-margin-block-end': mm(sheet.margin.bottom),
  '--qrcc-sheet-margin-inline-start': mm(sheet.margin.left),
  '--qrcc-sheet-columns': String(sheet.columns),
  '--qrcc-sheet-rows': String(sheet.rows),
  '--qrcc-cell-inline': mm(sheet.cell.width),
  '--qrcc-cell-block': mm(sheet.cell.height),
  '--qrcc-cell-gap-inline': mm(sheet.gap.x),
  '--qrcc-cell-gap-block': mm(sheet.gap.y),
})
