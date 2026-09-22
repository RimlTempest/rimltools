/**
 * @qrcc/manage の純粋ロジック。I/O は持たない。
 *
 * 「所有権・並び替え・ページングの境界」といった判断をここに集め、
 * 画面と RPC の両方から同じ規則を使う。
 */
export type { CodeContent, CodeFormError, CodeFormState } from './code-form.ts'
export {
  NEW_CODE_FORM,
  buildCodeDraft,
  toCodeContent,
  toCodeForm,
  toRestoreDraft,
} from './code-form.ts'
export type { CodeListState } from './paging.ts'
export { appendPage, firstPage, hasMore, indexOfCode, removeCode, restoreCode } from './paging.ts'
export type { CreateShareDraft, ShareDraftError } from './share-request.ts'
export { makeCreateShareDraft } from './share-request.ts'
export { ariaSortFor, nextSortFor } from './sorting.ts'
