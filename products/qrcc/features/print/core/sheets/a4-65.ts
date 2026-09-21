import type { LabelSheetOf } from '../../contract/index.ts'

/**
 * A4 65 面（38.1 × 21.2mm）。5 列 13 行。
 *
 * 1 枚に 65 個入る小さめの管理ラベル。列の間隔は 2.5mm、
 * 左右の余白 4.75 = (210 - 38.1 × 5 - 2.5 × 4) ÷ 2。
 */
export const A4_65: LabelSheetOf<'a4-65-38.1x21.2'> = {
  id: 'a4-65-38.1x21.2',
  page: { width: 210, height: 297 },
  margin: { top: 10.7, right: 4.75, bottom: 10.7, left: 4.75 },
  cell: { width: 38.1, height: 21.2 },
  gap: { x: 2.5, y: 0 },
  columns: 5,
  rows: 13,
}
