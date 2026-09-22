import type { LabelSheetOf } from '../../contract/index.ts'

/**
 * A4 12 面（86.4 × 42.3mm）。2 列 6 行。
 *
 * 列の間に 4.6mm の隙間があるので、`gap.x` を持つ唯一の…ではないが
 * 「間隔のある台紙」の代表。16.3 = (210 - 86.4 × 2 - 4.6) ÷ 2。
 */
export const A4_12: LabelSheetOf<'a4-12-86.4x42.3'> = {
  id: 'a4-12-86.4x42.3',
  page: { width: 210, height: 297 },
  margin: { top: 21.6, right: 16.3, bottom: 21.6, left: 16.3 },
  cell: { width: 86.4, height: 42.3 },
  gap: { x: 4.6, y: 0 },
  columns: 2,
  rows: 6,
}
