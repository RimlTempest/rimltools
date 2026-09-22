import type { LabelSheetOf } from '../../contract/index.ts'

/**
 * A4 全面 1 面（210 × 297mm・ノーカット）。
 *
 * 台紙としては余白ゼロが正しい寸法。ただし用紙の端まで刷れるプリンタは
 * 少ないので、そのことは `LABEL_SHEET_META` の `caution` で伝える
 * （寸法をプリンタの都合で歪めない）。
 */
export const A4_1: LabelSheetOf<'a4-1-210x297'> = {
  id: 'a4-1-210x297',
  page: { width: 210, height: 297 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  cell: { width: 210, height: 297 },
  gap: { x: 0, y: 0 },
  columns: 1,
  rows: 1,
}
