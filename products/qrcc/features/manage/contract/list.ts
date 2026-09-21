/**
 * 一覧の要求と応答（docs/api-contract.md の `codes.list`）。
 *
 * **`OFFSET` を使わない。** 並べ替えキーと id の組を積んだ不透明なカーソルで
 * 次のページに進む。ページ数が増えても読み取る行数が増えないので、
 * D1 の行読み取り無料枠を守れる（docs/free-tier-budget.md）。
 * カーソルの中身を組み立てるのは qrcc-api 側で、画面は文字列として運ぶだけ。
 */
import type { CodeId, FolderId, NonEmptyText } from '@qrcc/contract'
import { ok, parseCodeId, parseNonEmptyText } from '@qrcc/contract'
import type { SymbologyKind } from '@qrcc/generate/contract'
import { SYMBOLOGY_META } from '@qrcc/generate/contract'
import { readFolderId } from './code.ts'
import type { Decoded } from './wire.ts'
import { fail, isRecord, readDate, readString } from './wire.ts'

/** 1 ページの上限（docs/api-contract.md 6 節）。 */
export const MAX_PAGE_SIZE = 50
/** 既定のページ幅。1 画面に収まり、次ページの操作が近くに来る大きさ。 */
export const DEFAULT_PAGE_SIZE = 20

/** 並べ替えできる列。`aria-sort` を出す単位でもある。 */
export type SortColumn = 'name' | 'updated'

export const CODE_SORTS = ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'] as const

export type CodeSort = (typeof CODE_SORTS)[number]

type CodeSortMeta = {
  readonly column: SortColumn
  /** `aria-sort` の値としてそのまま使える向き。 */
  readonly direction: 'ascending' | 'descending'
  readonly label: string
}

/**
 * Mapped Type のレジストリ。`CodeSort` に並べ替えを足すと、
 * ここを埋めるまでコンパイルが通らない（追加漏れを型で止める）。
 */
export const CODE_SORT_META: { readonly [K in CodeSort]: CodeSortMeta } = {
  updated_desc: { column: 'updated', direction: 'descending', label: '更新が新しい順' },
  updated_asc: { column: 'updated', direction: 'ascending', label: '更新が古い順' },
  name_asc: { column: 'name', direction: 'ascending', label: '名前の昇順' },
  name_desc: { column: 'name', direction: 'descending', label: '名前の降順' },
}

/** 一覧に出す 1 件。詳細（payload / style）は開くまで読まない。 */
export type CodeSummary = {
  readonly id: CodeId
  readonly name: NonEmptyText
  readonly symbologyKind: SymbologyKind
  readonly folderId: FolderId | undefined
  readonly updatedAt: Date
}

export type CodeListRequest = {
  readonly folderId: FolderId | undefined
  /** 名前の部分一致。空文字は「絞り込まない」と同じ。 */
  readonly query: string | undefined
  readonly sort: CodeSort
  readonly limit: number
  /** 前のページが返したカーソル。最初のページでは省く。 */
  readonly cursor?: string
}

export type CodePage = {
  readonly items: readonly CodeSummary[]
  /** 次のページがあるときだけ入る。 */
  readonly nextCursor: string | undefined
}

const isSymbologyKind = (value: string | undefined): value is SymbologyKind =>
  value !== undefined && Object.hasOwn(SYMBOLOGY_META, value)

export const decodeCodeSummary = (value: unknown): Decoded<CodeSummary> => {
  if (!isRecord(value)) return fail('code summary must be an object')
  const id = parseCodeId(readString(value, 'id') ?? '')
  if (!id.ok) return fail('code summary requires a code id')
  const name = parseNonEmptyText(readString(value, 'name') ?? '')
  if (!name.ok) return fail('code summary requires a non-empty name')
  const kind = readString(value, 'kind')
  if (!isSymbologyKind(kind)) return fail(`unknown symbology kind: ${String(kind)}`)
  const folderId = readFolderId(value, 'folder_id')
  if (!folderId.ok) return folderId
  const updatedAt = readDate(value, 'updated_at')
  if (updatedAt === undefined) return fail('code summary requires "updated_at"')

  return ok({
    id: id.value,
    name: name.value,
    symbologyKind: kind,
    folderId: folderId.value,
    updatedAt,
  })
}

export const decodeCodePage = (value: unknown): Decoded<CodePage> => {
  if (!isRecord(value) || !Array.isArray(value['items'])) {
    return fail('code page requires an "items" array')
  }
  const items: CodeSummary[] = []
  for (const raw of value['items']) {
    const summary = decodeCodeSummary(raw)
    if (!summary.ok) return summary
    items.push(summary.value)
  }
  const nextCursor = readString(value, 'next_cursor')
  return ok({ items, nextCursor })
}

/**
 * 要求をワイヤ形式にする。
 *
 * 未指定は **キーを落とさず `null` で送る**。省略と「明示的に絞り込まない」を
 * 受け側が区別しなくて済み、扱いが 1 通りになる。
 */
export const toCodeListWire = (request: CodeListRequest) => ({
  folder_id: request.folderId ?? null,
  query: request.query === undefined || request.query === '' ? null : request.query,
  sort: request.sort,
  limit: Math.min(Math.max(Math.trunc(request.limit), 1), MAX_PAGE_SIZE),
  cursor: request.cursor ?? null,
})
