/**
 * @qrcc/manage の UI。
 *
 * どの画面も RPC の実体を知らない。`ManageDeps` を引数で受け取るので、
 * テストでは偽物を渡せる（配線は `*.route.tsx` だけが知っている）。
 */
export { CodeEditorScreen } from './code-editor-screen.tsx'
export { CodeTable } from './code-table.tsx'
export { CodesScreen } from './codes-screen.tsx'
export { ConfirmDialog } from './confirm-dialog.tsx'
export { browserCopyText, canCopyText } from './browser-manage.ts'
export { codePath, folderNameOf, formatDate, formatDateTime } from './format.ts'
export type { CodeLinkRenderer, ManageDeps } from './manage-deps.tsx'
export { defaultRenderLink } from './manage-deps.tsx'
export { SharePanel, describeShareDraftError } from './share-panel.tsx'
