import { describe, expect, test } from 'bun:test'
import type { ImposedCell, ImpositionRequest, PrintItem } from '../contract/index.ts'
import { MAX_LABELS, imposeLabels } from './imposition.ts'
import { LABEL_SHEETS } from './sheets/index.ts'

/** 24 面（3 列 8 行）を基準に境界値を見る。 */
const SHEET = LABEL_SHEETS['a4-24-70x33.9']

const item = (content: string, copies = 1): PrintItem => ({ name: content, content, copies })

const request = (over: Partial<ImpositionRequest> = {}): ImpositionRequest => ({
  sheet: SHEET,
  items: [item('https://example.com')],
  startCell: 1,
  ...over,
})

/** 失敗したらテストを落とす。`ok` の中身を見るための小道具。 */
const pages = (input: ImpositionRequest) => {
  const outcome = imposeLabels(input)
  if (!outcome.ok) throw new Error(`面付けに失敗した: ${JSON.stringify(outcome.error)}`)
  return outcome.value
}

const contentsOf = (cells: readonly ImposedCell[]) =>
  cells.map((cell) => (cell.kind === 'label' ? cell.item.content : null))

describe('imposeLabels', () => {
  test('印刷するものが 0 件ならページも 0 枚', () => {
    expect(pages(request({ items: [] }))).toEqual([])
  })

  test('枚数 0 のコードしかない場合もページは 0 枚', () => {
    expect(pages(request({ items: [{ name: '', content: 'x', copies: 0 }] }))).toEqual([])
  })

  test('1 件なら 1 ページ。残りは空きセルとして返す', () => {
    const result = pages(request())
    expect(result).toHaveLength(1)
    expect(result[0]?.cells).toHaveLength(24)
    expect(result[0]?.usedCells).toBe(1)
    expect(result[0]?.cells[0]?.kind).toBe('label')
    expect(result[0]?.cells[1]?.kind).toBe('blank')
  })

  test('ちょうど 1 ページぶんなら空きセルが出ない', () => {
    const result = pages(request({ items: [item('a', 24)] }))
    expect(result).toHaveLength(1)
    expect(result[0]?.usedCells).toBe(24)
    expect(result[0]?.cells.every((cell) => cell.kind === 'label')).toBe(true)
  })

  test('1 ページ + 1 件なら 2 ページ目に 1 枚だけ載る', () => {
    const result = pages(request({ items: [item('a', 25)] }))
    expect(result).toHaveLength(2)
    expect(result[1]?.pageNumber).toBe(2)
    expect(result[1]?.usedCells).toBe(1)
    expect(result[1]?.cells).toHaveLength(24)
    expect(result[1]?.cells[0]?.kind).toBe('label')
    expect(result[1]?.cells[1]?.kind).toBe('blank')
  })

  /** 使いかけの台紙を無駄にしないための、この機能の要。 */
  test('開始セルを指定すると、その手前は空きセルになる', () => {
    const result = pages(request({ startCell: 5 }))
    expect(contentsOf(result[0]?.cells ?? []).slice(0, 6)).toEqual([
      null,
      null,
      null,
      null,
      'https://example.com',
      null,
    ])
    expect(result[0]?.usedCells).toBe(1)
  })

  test('開始セルが最終セルなら、次の 1 枚は 2 ページ目の先頭に回る', () => {
    const result = pages(request({ items: [item('a', 2)], startCell: 24 }))
    expect(result).toHaveLength(2)
    expect(result[0]?.usedCells).toBe(1)
    expect(result[0]?.cells[23]?.kind).toBe('label')
    expect(result[1]?.cells[0]?.kind).toBe('label')
    expect(result[1]?.usedCells).toBe(1)
  })

  test('開始セルを指定するとページ跨ぎの位置もずれる', () => {
    // 5 番目から 24 枚 → 1 ページ目に 20 枚、2 ページ目に 4 枚
    const result = pages(request({ items: [item('a', 24)], startCell: 5 }))
    expect(result).toHaveLength(2)
    expect(result[0]?.usedCells).toBe(20)
    expect(result[1]?.usedCells).toBe(4)
    expect(result[1]?.cells[4]?.kind).toBe('blank')
  })

  test('同じコードを N 枚繰り返せる', () => {
    const result = pages(request({ items: [item('a', 3)] }))
    expect(contentsOf(result[0]?.cells ?? []).slice(0, 4)).toEqual(['a', 'a', 'a', null])
    const copies = (result[0]?.cells ?? []).flatMap((cell) =>
      cell.kind === 'label' ? [cell.copy] : [],
    )
    expect(copies).toEqual([1, 2, 3])
  })

  test('複数のコードは指定した順に並ぶ', () => {
    const result = pages(request({ items: [item('a', 2), item('b'), item('c', 2)] }))
    expect(contentsOf(result[0]?.cells ?? []).slice(0, 6)).toEqual(['a', 'a', 'b', 'c', 'c', null])
  })

  test('セルの行・列は台紙の列数どおりに数える', () => {
    const result = pages(request({ items: [item('a', 5)] }))
    const cells = result[0]?.cells ?? []
    expect(cells[0]).toMatchObject({ index: 1, row: 1, column: 1 })
    expect(cells[2]).toMatchObject({ index: 3, row: 1, column: 3 })
    expect(cells[3]).toMatchObject({ index: 4, row: 2, column: 1 })
    expect(cells[23]).toMatchObject({ index: 24, row: 8, column: 3 })
  })

  test('台紙を変えると 1 ページの面数も変わる', () => {
    const result = pages(
      request({ sheet: LABEL_SHEETS['a4-65-38.1x21.2'], items: [item('a', 66)] }),
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.cells).toHaveLength(65)
    expect(result[1]?.usedCells).toBe(1)
  })

  test('1 面の台紙では 1 枚ごとにページが変わる', () => {
    const result = pages(request({ sheet: LABEL_SHEETS['a4-1-210x297'], items: [item('a', 3)] }))
    expect(result).toHaveLength(3)
    expect(result.every((page) => page.cells.length === 1)).toBe(true)
  })
})

describe('imposeLabels のエラー', () => {
  test('開始セルが 0 以下なら拒否する', () => {
    const outcome = imposeLabels(request({ startCell: 0 }))
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'start_cell_out_of_range', startCell: 0, cellsPerSheet: 24 },
    })
  })

  test('開始セルが面数を超えたら拒否する', () => {
    const outcome = imposeLabels(request({ startCell: 25 }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.kind).toBe('start_cell_out_of_range')
  })

  test('開始セルが整数でなければ拒否する', () => {
    const outcome = imposeLabels(request({ startCell: 2.5 }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.kind).toBe('start_cell_out_of_range')
  })

  test('枚数が負や小数なら、どのコードかを添えて拒否する', () => {
    const outcome = imposeLabels(
      request({ items: [item('a'), { name: '名札', content: 'b', copies: -1 }] }),
    )
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'invalid_copies', name: '名札', copies: -1 },
    })
  })

  test('上限を超える枚数は拒否する（ブラウザを止めないため）', () => {
    const outcome = imposeLabels(request({ items: [item('a', MAX_LABELS + 1)] }))
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'too_many_labels', requested: MAX_LABELS + 1, maximum: MAX_LABELS },
    })
  })

  test('上限ちょうどは受け付ける', () => {
    const outcome = imposeLabels(request({ items: [item('a', MAX_LABELS)] }))
    expect(outcome.ok).toBe(true)
  })
})
