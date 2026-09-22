/**
 * 列見出しを押したときの並べ替えの動き（純粋）。
 *
 * 「押すとどうなるか」と「`aria-sort` に何が出るか」を同じ規則から導く。
 * 別々に書くと、見た目と読み上げが静かにずれる。
 */
import type { CodeSort, SortColumn } from '@qrcc/manage/contract'
import { CODE_SORT_META } from '@qrcc/manage/contract'

/**
 * その列を最初に押したときの並び。
 * 日付は「新しい順」、名前は「あいうえお順」が期待に合う。
 */
const INITIAL_SORT: { readonly [K in SortColumn]: CodeSort } = {
  updated: 'updated_desc',
  name: 'name_asc',
}

const REVERSED: { readonly [K in CodeSort]: CodeSort } = {
  updated_desc: 'updated_asc',
  updated_asc: 'updated_desc',
  name_asc: 'name_desc',
  name_desc: 'name_asc',
}

/** すでにその列で並べているなら向きを反転し、違う列なら自然な向きから始める。 */
export const nextSortFor = (column: SortColumn, current: CodeSort): CodeSort =>
  CODE_SORT_META[current].column === column ? REVERSED[current] : INITIAL_SORT[column]

/** `aria-sort` の値。並べ替えていない列は `none`。 */
export const ariaSortFor = (
  column: SortColumn,
  current: CodeSort,
): 'ascending' | 'descending' | 'none' =>
  CODE_SORT_META[current].column === column ? CODE_SORT_META[current].direction : 'none'
