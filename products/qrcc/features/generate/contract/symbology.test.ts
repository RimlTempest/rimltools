/**
 * 新しく足す 1D 符号のメタ情報が、読み取り側（`features/scan/contract/symbology.ts`）
 * とラベルを揃えていること、内容の種類を `['text']` に絞っていることを確かめる。
 *
 * ラベルを手で揃えている理由は `features/generate/contract/symbology.ts` の
 * コメントと `plans/004-1d-symbologies.md` を参照。
 */
import { describe, expect, test } from 'bun:test'
import { SYMBOLOGY_KINDS, SYMBOLOGY_META } from './symbology.ts'

describe('code39', () => {
  test('読み取り側と同じラベルを名乗る', () => {
    expect(SYMBOLOGY_META.code39.label).toBe('Code 39')
  })

  test('1D で、テキストしか載せられない', () => {
    expect(SYMBOLOGY_KINDS).toContain('code39')
    expect(SYMBOLOGY_META.code39.oneDimensional).toBe(true)
    expect(SYMBOLOGY_META.code39.acceptsPayloads).toEqual(['text'])
  })
})

describe('code93', () => {
  test('読み取り側と同じラベルを名乗る', () => {
    expect(SYMBOLOGY_META.code93.label).toBe('Code 93')
  })

  test('1D で、テキストしか載せられない', () => {
    expect(SYMBOLOGY_KINDS).toContain('code93')
    expect(SYMBOLOGY_META.code93.oneDimensional).toBe(true)
    expect(SYMBOLOGY_META.code93.acceptsPayloads).toEqual(['text'])
  })
})

describe('ean8', () => {
  test('読み取り側と同じラベルを名乗る', () => {
    expect(SYMBOLOGY_META.ean8.label).toBe('EAN-8')
  })

  test('1D で、テキストしか載せられない', () => {
    expect(SYMBOLOGY_KINDS).toContain('ean8')
    expect(SYMBOLOGY_META.ean8.oneDimensional).toBe(true)
    expect(SYMBOLOGY_META.ean8.acceptsPayloads).toEqual(['text'])
  })
})

describe('itf', () => {
  test('読み取り側と同じラベルを名乗る', () => {
    expect(SYMBOLOGY_META.itf.label).toBe('ITF（インターリーブド 2 of 5）')
  })

  test('1D で、テキストしか載せられない', () => {
    expect(SYMBOLOGY_KINDS).toContain('itf')
    expect(SYMBOLOGY_META.itf.oneDimensional).toBe(true)
    expect(SYMBOLOGY_META.itf.acceptsPayloads).toEqual(['text'])
  })
})

describe('codabar', () => {
  test('読み取り側と同じラベルを名乗る', () => {
    expect(SYMBOLOGY_META.codabar.label).toBe('Codabar')
  })

  test('1D で、テキストしか載せられない', () => {
    expect(SYMBOLOGY_KINDS).toContain('codabar')
    expect(SYMBOLOGY_META.codabar.oneDimensional).toBe(true)
    expect(SYMBOLOGY_META.codabar.acceptsPayloads).toEqual(['text'])
  })
})
