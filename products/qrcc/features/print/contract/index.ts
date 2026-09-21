/**
 * @qrcc/print の契約。
 *
 * 台紙の型番と説明（`sheet.ts`）、面付け設定と印刷ジョブ（`job.ts`）。
 * 台紙の物理寸法だけは `features/print/core/sheets/` が定義元で、
 * ここには置かない（寸法を二重に持たないため。ADR-0005）。
 */
export type {
  Caption,
  CaptionKind,
  ImposedCell,
  ImposedPage,
  ImpositionError,
  ImpositionRequest,
  PrintItem,
  PrintJob,
} from './job.ts'
export { CAPTION_KINDS, CAPTION_META, describeImpositionError } from './job.ts'
export type { Edges, LabelSheet, LabelSheetId, LabelSheetOf, Millimeter } from './sheet.ts'
export { LABEL_SHEET_IDS, LABEL_SHEET_META, isLabelSheetId, parseLabelSheetId } from './sheet.ts'
