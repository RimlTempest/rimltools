/**
 * 面付け。コードの一覧と台紙と開始位置から、ページごとのセル配置を決める。
 *
 * ここは純粋関数だけで、I/O も描画も持たない。
 * **座標は計算しない** — セルを左上から順に（空きも含めて）並べるだけで、
 * 実際の配置は CSS Grid の自動配置が行う（ADR-0005 / rimltools-html-a11y）。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type {
  ImposedCell,
  ImposedPage,
  ImpositionError,
  ImpositionRequest,
  PrintItem,
} from '../contract/index.ts'
import { cellsPerSheet } from './sheets/index.ts'

/**
 * 一度に面付けできるラベルの上限。
 *
 * 1 枚ごとにブラウザ側でコードを生成するので、上限がないと
 * 入力ミス（枚数に 99999）でタブが固まる。65 面の台紙で約 7 枚ぶん。
 */
export const MAX_LABELS = 500

type Placement = {
  readonly item: PrintItem
  readonly copy: number
}

/** 枚数ぶんに展開する。ここで初めて「同じコードの N 枚目」が区別される。 */
const expand = (items: readonly PrintItem[]): Result<readonly Placement[], ImpositionError> => {
  const placements: Placement[] = []
  for (const item of items) {
    if (!Number.isInteger(item.copies) || item.copies < 0) {
      return err({ kind: 'invalid_copies', name: item.name, copies: item.copies })
    }
    for (let copy = 1; copy <= item.copies; copy += 1) placements.push({ item, copy })
  }
  return ok(placements)
}

/**
 * 面付けする。
 *
 * `startCell` は 1 始まりで、**使いかけの台紙の何番目のセルから刷るか**を表す。
 * その手前は空きセルとして返るので、呼び出し側は詰め直しをしなくてよい。
 */
export const imposeLabels = (
  request: ImpositionRequest,
): Result<readonly ImposedPage[], ImpositionError> => {
  const perSheet = cellsPerSheet(request.sheet)
  const { startCell } = request

  if (!Number.isInteger(startCell) || startCell < 1 || startCell > perSheet) {
    return err({ kind: 'start_cell_out_of_range', startCell, cellsPerSheet: perSheet })
  }

  const placements = expand(request.items)
  if (!placements.ok) return placements
  const labels = placements.value

  if (labels.length > MAX_LABELS) {
    return err({ kind: 'too_many_labels', requested: labels.length, maximum: MAX_LABELS })
  }
  // 刷るものが無いなら白紙も出さない
  if (labels.length === 0) return ok([])

  const offset = startCell - 1
  const pageCount = Math.ceil((offset + labels.length) / perSheet)
  const pages: ImposedPage[] = []

  for (let page = 0; page < pageCount; page += 1) {
    const cells: ImposedCell[] = []
    let usedCells = 0

    for (let slot = 0; slot < perSheet; slot += 1) {
      const index = slot + 1
      const row = Math.floor(slot / request.sheet.columns) + 1
      const column = (slot % request.sheet.columns) + 1
      const labelIndex = page * perSheet + slot - offset
      const placement = labelIndex < 0 ? undefined : labels[labelIndex]

      if (placement === undefined) {
        cells.push({ kind: 'blank', index, row, column })
        continue
      }
      cells.push({ kind: 'label', index, row, column, item: placement.item, copy: placement.copy })
      usedCells += 1
    }

    pages.push({ pageNumber: page + 1, cells, usedCells })
  }

  return ok(pages)
}
