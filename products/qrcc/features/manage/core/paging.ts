/**
 * 一覧の状態（純粋）。カーソルで読み足していく。
 *
 * 削除の取り消し（AAA 3.3.6）を成り立たせるため、**元あった位置**に
 * 戻せるようにしてある。並びが変わると、取り消した本人が見失う。
 */
import type { CodeId } from '@qrcc/contract'
import type { CodePage, CodeSummary } from '@qrcc/manage/contract'

export type CodeListState = {
  readonly items: readonly CodeSummary[]
  /** 次のページがあるときだけ入る。 */
  readonly nextCursor: string | undefined
}

export const firstPage = (page: CodePage): CodeListState => ({
  items: page.items,
  nextCursor: page.nextCursor,
})

/**
 * 次のページを後ろに足す。
 *
 * 読み込み中に他の端末で更新されると同じ行が 2 ページに現れうるので、
 * すでにある id は落とす（key が重複すると描画が壊れる）。
 */
export const appendPage = (state: CodeListState, page: CodePage): CodeListState => {
  const known = new Set(state.items.map((item) => item.id))
  return {
    items: [...state.items, ...page.items.filter((item) => !known.has(item.id))],
    nextCursor: page.nextCursor,
  }
}

export const hasMore = (state: CodeListState): boolean => state.nextCursor !== undefined

/** 削除された行を取り除く。次のカーソルは動かさない。 */
export const removeCode = (state: CodeListState, id: CodeId): CodeListState => ({
  ...state,
  items: state.items.filter((item) => item.id !== id),
})

/** 取り消しで元の位置に戻す。すでにある場合は何もしない。 */
export const restoreCode = (
  state: CodeListState,
  item: CodeSummary,
  index: number,
): CodeListState => {
  if (state.items.some((existing) => existing.id === item.id)) return state
  const items = [...state.items]
  items.splice(Math.min(Math.max(index, 0), items.length), 0, item)
  return { ...state, items }
}

/** 取り消しに備えて、消す前の位置を覚えておく。 */
export const indexOfCode = (state: CodeListState, id: CodeId): number =>
  state.items.findIndex((item) => item.id === id)
