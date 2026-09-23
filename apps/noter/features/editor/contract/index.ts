/**
 * @noter/editor/contract — エディタ画面の公開型。
 *
 * 実装依存ゼロ。CodeMirror も Yjs も知らない。
 */
export type { DocumentActions } from './actions.ts'
export type { ConvertOutcome } from './convert-outcome.ts'
export type { EditorDiagnostic } from './diagnostic.ts'
export type { FormatOutcome } from './format-outcome.ts'
export type { ImportError } from './import-error.ts'
export { describeImportError } from './import-error.ts'
export type { Peer } from './peer.ts'
export type { SaveState } from './save-state.ts'
export type { StatusText, StatusTone } from './status.ts'
export { STATUS_TONES } from './status.ts'
export type { ViewMode } from './view-mode.ts'
export { VIEW_MODES, VIEW_MODE_LABEL } from './view-mode.ts'
