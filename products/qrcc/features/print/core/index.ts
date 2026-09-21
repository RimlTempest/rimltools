/**
 * 印刷の純粋ロジック。I/O は持たない（CI の guard が検査する）。
 *
 * - `sheets/` … ラベル台紙の物理寸法。1 台紙 1 ファイル
 * - `imposition.ts` … 面付け（どのコードをどのセルに置くか）
 * - `sheet-css.ts` … 台紙寸法 → CSS カスタムプロパティ
 * - `items.ts` / `caption.ts` … 入力の読み替えとキャプション
 */
export { captionFor } from './caption.ts'
export { MAX_LABELS, imposeLabels } from './imposition.ts'
export { parseItemLines } from './items.ts'
export type { SheetCustomProperties } from './sheet-css.ts'
export { sheetCustomProperties } from './sheet-css.ts'
export { LABEL_SHEETS, cellsPerSheet } from './sheets/index.ts'
