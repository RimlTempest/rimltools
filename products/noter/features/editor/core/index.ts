/**
 * @noter/editor/core — エディタ画面の純粋ロジック。
 *
 * I/O を持たない。CodeMirror も Yjs も DOM も知らないので、
 * すべて Small テストで確かめられる。
 */
export type { LocalPresenceState } from './awareness.ts'
export { localPresenceState, readPeers } from './awareness.ts'
export type { Debounced, TimerPort } from './debounce.ts'
export { debounce } from './debounce.ts'
export { toEditorDiagnostics } from './diagnostics.ts'
export { fnv1a } from './hash.ts'
export { guestDisplayName, shouldPromptName } from './guest-name.ts'
export { byteLength, checkImportSize } from './import-guard.ts'
export { joinedMessage, leftMessage } from './presence.ts'
export { PRESENCE_COLOR_COUNT, presenceIndex } from './presence-color.ts'
export { clockText, statusText } from './status-text.ts'
export type { TextLines, TextRange } from './text-range.ts'
export { rangeAt } from './text-range.ts'
export { SPLIT_MIN_WIDTH_PX, defaultViewMode, nextViewMode, parseViewMode } from './view-mode.ts'
