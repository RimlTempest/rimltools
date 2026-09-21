import { describe, expect, test } from 'bun:test'
import { sheetCustomProperties } from './sheet-css.ts'
import { LABEL_SHEETS } from './sheets/index.ts'

describe('sheetCustomProperties', () => {
  /**
   * 寸法を CSS に書き写さないための橋渡し（ADR-0005）。
   * ここが台紙定義と CSS の唯一の接点になる。
   */
  test('台紙の寸法をそのまま mm のカスタムプロパティにする', () => {
    expect(sheetCustomProperties(LABEL_SHEETS['a4-24-70x33.9'])).toEqual({
      '--qrcc-sheet-page-inline': '210mm',
      '--qrcc-sheet-page-block': '297mm',
      '--qrcc-sheet-margin-block-start': '12.9mm',
      '--qrcc-sheet-margin-inline-end': '0mm',
      '--qrcc-sheet-margin-block-end': '12.9mm',
      '--qrcc-sheet-margin-inline-start': '0mm',
      '--qrcc-sheet-columns': '3',
      '--qrcc-sheet-rows': '8',
      '--qrcc-cell-inline': '70mm',
      '--qrcc-cell-block': '33.9mm',
      '--qrcc-cell-gap-inline': '0mm',
      '--qrcc-cell-gap-block': '0mm',
    })
  })

  test('間隔のある台紙では間隔も渡る', () => {
    const properties = sheetCustomProperties(LABEL_SHEETS['a4-65-38.1x21.2'])
    expect(properties['--qrcc-cell-gap-inline']).toBe('2.5mm')
    expect(properties['--qrcc-sheet-margin-inline-start']).toBe('4.75mm')
    expect(properties['--qrcc-sheet-columns']).toBe('5')
  })
})
