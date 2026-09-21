/** 画面に出す文字列づくり。ロジックを含まないので、画面から切り出しておく。 */
import type { FolderId } from '@qrcc/contract'
import type { Folder } from '@qrcc/manage/contract'

const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' })

export const formatDateTime = (at: Date): string => dateTimeFormat.format(at)

export const formatDate = (at: Date): string => dateFormat.format(at)

/** フォルダ未所属も「なし」と読み上げる（空欄だと何も伝わらない）。 */
export const folderNameOf = (
  folders: readonly Folder[],
  folderId: FolderId | undefined,
): string => {
  if (folderId === undefined) return 'なし'
  return folders.find((folder) => folder.id === folderId)?.name ?? 'なし'
}

/** コードの編集画面の URL。ここ 1 箇所で決める。 */
export const codePath = (id: string): string => `/codes/${id}`
