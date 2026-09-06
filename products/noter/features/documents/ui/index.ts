/**
 * @noter/documents の UI。ルータも env も知らない。
 * 操作は引数で受け取るので、テストでは偽物を渡せる。
 */
export type { DocumentActions } from './document-screen.tsx'
export { DocumentScreen } from './document-screen.tsx'
export type { DocumentLinkRenderer, HomeActions } from './home-screen.tsx'
export { GUEST_NOTICE_KEY, HomeScreen } from './home-screen.tsx'
export { KIND_LABEL, ROLE_LABEL, formatDate, formatDateTime } from './labels.ts'
export { ShareEntryScreen } from './share-entry-screen.tsx'
export type { ShareActions } from './share-dialog.tsx'
export { ShareDialog } from './share-dialog.tsx'
