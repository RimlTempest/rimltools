/**
 * @noter/editor/core — エディタ画面の純粋ロジック。
 *
 * I/O を持たない。CodeMirror も Yjs も DOM も知らないので、
 * すべて Small テストで確かめられる。
 */
export { fnv1a } from './hash.ts'
export { guestDisplayName, shouldPromptName } from './guest-name.ts'
export { byteLength, checkImportSize } from './import-guard.ts'
export { joinedMessage, leftMessage } from './presence.ts'
export { PRESENCE_COLOR_COUNT, presenceIndex } from './presence-color.ts'
export { clockText, statusText } from './status-text.ts'
export { SPLIT_MIN_WIDTH_PX, defaultViewMode, nextViewMode, parseViewMode } from './view-mode.ts'
