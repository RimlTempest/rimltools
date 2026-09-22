/**
 * 保存されたコード（docs/domain-model.md 3 節）。
 *
 * ワイヤ上は D1 の列そのままの snake_case で、ドメイン側は Branded 型と `Date`。
 * 変換をこの 1 ファイルに閉じ込め、画面と RPC のどちらにも生の JSON を流さない。
 */
import type { CodeId, FolderId, NonEmptyText, UserId } from '@qrcc/contract'
import { ok, parseCodeId, parseFolderId, parseNonEmptyText, parseUserId } from '@qrcc/contract'
import type { CodePayload, RenderStyle, Symbology } from '@qrcc/generate/contract'
import { decodeCodePayload, decodeRenderStyle, decodeSymbology } from './spec.ts'
import type { Decoded } from './wire.ts'
import { fail, isRecord, readDate, readString } from './wire.ts'

export type SavedCode = {
  readonly id: CodeId
  readonly ownerId: UserId
  /** フォルダ未所属なら `undefined`。入れ物が消えてもコードは残る。 */
  readonly folderId: FolderId | undefined
  readonly name: NonEmptyText
  readonly payload: CodePayload
  readonly symbology: Symbology
  readonly style: RenderStyle
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * 保存・上書きのときに送る内容。
 *
 * `id` は **qrcc-web が発行する**（`newCodeId` に `crypto.getRandomValues` を
 * 注入する）。qrcc-api は乱数源を持たず、受け取った id の形だけを検証する。
 * 所有者と日時はサーバが決めるので、ここには入らない。
 */
export type CodeDraft = Omit<SavedCode, 'ownerId' | 'createdAt' | 'updatedAt'>

/** 未所属を `undefined`、値があれば `FolderId` として読む。 */
export const readFolderId = (
  source: Record<string, unknown>,
  key: string,
): Decoded<FolderId | undefined> => {
  if (source[key] === null || source[key] === undefined) return ok(undefined)
  const folderId = parseFolderId(readString(source, key) ?? '')
  return folderId.ok ? ok(folderId.value) : fail(`"${key}" is not a folder id`)
}

export const decodeSavedCode = (value: unknown): Decoded<SavedCode> => {
  if (!isRecord(value)) return fail('code must be an object')

  const id = parseCodeId(readString(value, 'id') ?? '')
  if (!id.ok) return fail('code requires a code id')
  const ownerId = parseUserId(readString(value, 'owner_id') ?? '')
  if (!ownerId.ok) return fail('code requires an owner id')
  const name = parseNonEmptyText(readString(value, 'name') ?? '')
  if (!name.ok) return fail('code requires a non-empty name')

  const folderId = readFolderId(value, 'folder_id')
  if (!folderId.ok) return folderId

  const payload = decodeCodePayload(value['payload'])
  if (!payload.ok) return payload
  const symbology = decodeSymbology(value['symbology'])
  if (!symbology.ok) return symbology
  const style = decodeRenderStyle(value['style'])
  if (!style.ok) return style

  const createdAt = readDate(value, 'created_at')
  const updatedAt = readDate(value, 'updated_at')
  if (createdAt === undefined || updatedAt === undefined) {
    return fail('code requires "created_at" and "updated_at"')
  }

  return ok({
    id: id.value,
    ownerId: ownerId.value,
    folderId: folderId.value,
    name: name.value,
    payload: payload.value,
    symbology: symbology.value,
    style: style.value,
    createdAt,
    updatedAt,
  })
}

/**
 * 保存する内容をワイヤ形式にする。
 *
 * `payload` / `symbology` / `style` はそのまま JSON 1 列に入る形なので、
 * ここで詰め替えない（詰め替えると保存と読み出しで形がずれる）。
 */
export const toCodeDraftWire = (draft: CodeDraft) => ({
  id: draft.id,
  name: draft.name,
  folder_id: draft.folderId ?? null,
  payload: draft.payload,
  symbology: draft.symbology,
  style: draft.style,
})
