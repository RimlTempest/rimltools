/**
 * フォルダ（docs/domain-model.md 1 節）。ネストは 1 段までにしない — 作らない。
 *
 * 一覧に「入っているコードの件数」を持たせていないのは、件数を出すたびに
 * D1 の行読み取りが増えるため（docs/free-tier-budget.md）。
 */
import type { FolderId, NonEmptyText } from '@qrcc/contract'
import { ok, parseFolderId, parseNonEmptyText } from '@qrcc/contract'
import type { Decoded } from './wire.ts'
import { fail, isRecord, readDate, readString } from './wire.ts'

export type Folder = {
  readonly id: FolderId
  readonly name: NonEmptyText
  readonly updatedAt: Date
}

/** 作成・改名で送る内容。`id` は qrcc-web が発行する。 */
export type FolderDraft = {
  readonly id: FolderId
  readonly name: NonEmptyText
}

export const decodeFolder = (value: unknown): Decoded<Folder> => {
  if (!isRecord(value)) return fail('folder must be an object')
  const id = parseFolderId(readString(value, 'id') ?? '')
  if (!id.ok) return fail('folder requires a folder id')
  const name = parseNonEmptyText(readString(value, 'name') ?? '')
  if (!name.ok) return fail('folder requires a non-empty name')
  const updatedAt = readDate(value, 'updated_at')
  return updatedAt === undefined
    ? fail('folder requires "updated_at"')
    : ok({ id: id.value, name: name.value, updatedAt })
}

export const decodeFolderList = (value: unknown): Decoded<readonly Folder[]> => {
  if (!isRecord(value) || !Array.isArray(value['items'])) {
    return fail('folder list requires an "items" array')
  }
  const folders: Folder[] = []
  for (const raw of value['items']) {
    const folder = decodeFolder(raw)
    if (!folder.ok) return folder
    folders.push(folder.value)
  }
  return ok(folders)
}

export const toFolderDraftWire = (draft: FolderDraft) => ({ id: draft.id, name: draft.name })
