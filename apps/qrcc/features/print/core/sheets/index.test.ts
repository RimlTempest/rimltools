import { describe, expect, test } from 'bun:test'
import type { LabelSheet, LabelSheetId } from '../../contract/index.ts'
import { LABEL_SHEET_IDS, LABEL_SHEET_META } from '../../contract/index.ts'
import { LABEL_SHEETS, cellsPerSheet } from './index.ts'

/** 寸法はミリメートルなので、浮動小数の丸め（0.01mm 未満）は同じとみなす。 */
const MM_EPSILON = 0.01

const sheets = (): readonly LabelSheet[] => LABEL_SHEET_IDS.map((id) => LABEL_SHEETS[id])

describe('ラベル台紙の定義', () => {
  test('日本で入手しやすい 4 種類がそろっている', () => {
    expect(LABEL_SHEET_IDS).toEqual([
      'a4-24-70x33.9',
      'a4-12-86.4x42.3',
      'a4-65-38.1x21.2',
      'a4-1-210x297',
    ])
  })

  test('レジストリの鍵と台紙の型番が一致する', () => {
    for (const id of LABEL_SHEET_IDS) {
      expect(LABEL_SHEETS[id].id).toBe(id)
    }
  })

  test('すべての台紙に説明がある（台紙を足したら説明も足す）', () => {
    for (const id of LABEL_SHEET_IDS) {
      expect(LABEL_SHEET_META[id].label.length).toBeGreaterThan(0)
      expect(LABEL_SHEET_META[id].description.length).toBeGreaterThan(0)
      expect(LABEL_SHEET_META[id].caution.length).toBeGreaterThan(0)
    }
  })

  /** 余白 + セル + 間隔が用紙をはみ出すと、刷った瞬間にずれる。 */
  test('セルと余白の合計が用紙に収まる', () => {
    for (const sheet of sheets()) {
      const usedWidth =
        sheet.margin.left
        + sheet.columns * sheet.cell.width
        + (sheet.columns - 1) * sheet.gap.x
        + sheet.margin.right
      const usedHeight =
        sheet.margin.top
        + sheet.rows * sheet.cell.height
        + (sheet.rows - 1) * sheet.gap.y
        + sheet.margin.bottom
      expect(Math.abs(usedWidth - sheet.page.width)).toBeLessThan(MM_EPSILON)
      expect(Math.abs(usedHeight - sheet.page.height)).toBeLessThan(MM_EPSILON)
    }
  })

  test('行数・列数・寸法はすべて正の数', () => {
    for (const sheet of sheets()) {
      expect(sheet.columns).toBeGreaterThan(0)
      expect(sheet.rows).toBeGreaterThan(0)
      expect(Number.isInteger(sheet.columns)).toBe(true)
      expect(Number.isInteger(sheet.rows)).toBe(true)
      expect(sheet.cell.width).toBeGreaterThan(0)
      expect(sheet.cell.height).toBeGreaterThan(0)
      expect(sheet.gap.x).toBeGreaterThanOrEqual(0)
      expect(sheet.gap.y).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * 印刷 CSS の `@page` は A4 縦のみを宣言している。
   * A4 以外の台紙を足したら、この試験が落ちて CSS の追従を促す
   * （寸法の二重管理を避けつつ、取りこぼしも防ぐ）。
   */
  test('いまのところ全台紙が A4 縦（print.css の @page と対応）', () => {
    for (const sheet of sheets()) {
      expect(sheet.page).toEqual({ width: 210, height: 297 })
    }
  })

  test('面数は型番の数字と一致する', () => {
    const faces: { readonly [K in LabelSheetId]: number } = {
      'a4-24-70x33.9': 24,
      'a4-12-86.4x42.3': 12,
      'a4-65-38.1x21.2': 65,
      'a4-1-210x297': 1,
    }
    for (const id of LABEL_SHEET_IDS) {
      expect(cellsPerSheet(LABEL_SHEETS[id])).toBe(faces[id])
    }
  })
})
