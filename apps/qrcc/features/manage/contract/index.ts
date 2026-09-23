/**
 * @qrcc/manage の契約。
 *
 * 保存されたコード・フォルダ・共有リンクの型と、ワイヤ（RPC の JSON）との
 * 変換だけを置く。「誰が何をしてよいか」は `@qrcc/auth/contract`、
 * コードの中身（payload / symbology / style）は `@qrcc/generate/contract` が
 * 持っていて、ここでは定義し直さない。
 */
export type { CodeDraft, SavedCode } from './code.ts'
export { decodeSavedCode, readFolderId, toCodeDraftWire } from './code.ts'
export type { CodeDetail, SharePreview } from './detail.ts'
export { decodeCodeDetail, decodeSharePreview } from './detail.ts'
export type { Folder, FolderDraft } from './folder.ts'
export { decodeFolder, decodeFolderList, toFolderDraftWire } from './folder.ts'
export type { CodeListRequest, CodePage, CodeSort, CodeSummary, SortColumn } from './list.ts'
export {
  CODE_SORTS,
  CODE_SORT_META,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodeCodePage,
  decodeCodeSummary,
  toCodeListWire,
} from './list.ts'
export type { ShareDraft, ShareLink } from './share.ts'
export { SHARE_PATH_PREFIX, decodeShareLink, shareUrl, toShareDraftWire } from './share.ts'
export { decodeCodePayload, decodeRenderStyle, decodeSymbology } from './spec.ts'
export type { DecodeIssue, Decoded } from './wire.ts'
export { fromUnixSeconds, toUnixSeconds } from './wire.ts'
