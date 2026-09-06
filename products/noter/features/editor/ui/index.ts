/**
 * @noter/editor の UI。ルータも env も知らない。
 * 接続も操作も引数で受け取るので、テストでは偽物を渡せる。
 */
export type { EditorHandle } from './code-editor.tsx'
export { CodeEditor } from './code-editor.tsx'
export { ConfirmDialog } from './confirm-dialog.tsx'
export { DocumentPreview } from './document-preview.tsx'
export { EditorHeader } from './editor-header.tsx'
export { EditorScreen } from './editor-screen.tsx'
export type { ImportPlacement } from './editor-toolbar.tsx'
export { EditorToolbar } from './editor-toolbar.tsx'
export { stashInitialBody, takeInitialBody } from './initial-body.ts'
export { languageOf } from './language.ts'
export { NamePrompt } from './name-prompt.tsx'
export { Presence } from './presence.tsx'
export { StatusPill } from './status-pill.tsx'
export { noterTheme } from './theme.ts'
export type { Announcer } from './use-announcer.ts'
export { useAnnouncer } from './use-announcer.ts'
export type { DocumentSync, DocumentSyncDeps, SyncProvider } from './use-document-sync.ts'
export { useDocumentSync } from './use-document-sync.ts'
export { TEXT_DEBOUNCE_MS, useDocumentText } from './use-document-text.ts'
export { ViewSwitch } from './view-switch.tsx'
