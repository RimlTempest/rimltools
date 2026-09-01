import type { LabelSheetOf } from '../../contract/index.ts'

/**
 * A4 24 面（70 × 33.9mm）。3 列 8 行。
 *
 * 左右いっぱいまでセルが並ぶ台紙で、上下にだけ 12.9mm の余白がある。
 * 12.9 = (297 - 33.9 × 8) ÷ 2。
 */
export const A4_24: LabelSheetOf<'a4-24-70x33.9'> = {
  id: 'a4-24-70x33.9',
  page: { width: 210, height: 297 },
  margin: { top: 12.9, right: 0, bottom: 12.9, left: 0 },
  cell: { width: 70, height: 33.9 },
  gap: { x: 0, y: 0 },
  columns: 3,
  rows: 8,
}
