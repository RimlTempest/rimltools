/**
 * 台紙レジストリ。**台紙を足すときはここに 1 行足すだけで、
 * 面付けアルゴリズムも CSS も触らない**（docs/architecture.md の拡張点）。
 *
 * Mapped Type なので、`LabelSheetId` に型番を足してこの表を埋め忘れると
 * コンパイルエラーになる。
 */
import type { LabelSheet, LabelSheetId, LabelSheetOf } from '../../contract/index.ts'
import { A4_1 } from './a4-1.ts'
import { A4_12 } from './a4-12.ts'
import { A4_24 } from './a4-24.ts'
import { A4_65 } from './a4-65.ts'

export const LABEL_SHEETS: { readonly [K in LabelSheetId]: LabelSheetOf<K> } = {
  'a4-24-70x33.9': A4_24,
  'a4-12-86.4x42.3': A4_12,
  'a4-65-38.1x21.2': A4_65,
  'a4-1-210x297': A4_1,
}

/** 台紙 1 枚に入るラベルの数。 */
export const cellsPerSheet = (sheet: LabelSheet): number => sheet.columns * sheet.rows
