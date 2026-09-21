import { describe, expect, test } from 'bun:test'
import { ariaSortFor, nextSortFor } from './sorting.ts'

/**
 * 並べ替えは列見出しのボタンで切り替える。押したときにどうなるかと、
 * `aria-sort` が何になるかは同じ規則から出す（見た目と読み上げをずらさない）。
 */
describe('nextSortFor', () => {
  test('同じ列をもう一度押すと向きが反転する', () => {
    expect(nextSortFor('updated', 'updated_desc')).toBe('updated_asc')
    expect(nextSortFor('updated', 'updated_asc')).toBe('updated_desc')
    expect(nextSortFor('name', 'name_asc')).toBe('name_desc')
    expect(nextSortFor('name', 'name_desc')).toBe('name_asc')
  })

  /** 日付は「新しい順」、名前は「あいうえお順」が期待に合う。 */
  test('別の列を押すと、その列にとって自然な向きから始まる', () => {
    expect(nextSortFor('name', 'updated_desc')).toBe('name_asc')
    expect(nextSortFor('updated', 'name_asc')).toBe('updated_desc')
  })
})

describe('ariaSortFor', () => {
  test('並べ替えていない列は none', () => {
    expect(ariaSortFor('name', 'updated_desc')).toBe('none')
    expect(ariaSortFor('updated', 'name_asc')).toBe('none')
  })

  test('並べ替え中の列は向きをそのまま伝える', () => {
    expect(ariaSortFor('updated', 'updated_desc')).toBe('descending')
    expect(ariaSortFor('updated', 'updated_asc')).toBe('ascending')
    expect(ariaSortFor('name', 'name_asc')).toBe('ascending')
    expect(ariaSortFor('name', 'name_desc')).toBe('descending')
  })
})
