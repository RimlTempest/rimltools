import { describe, expect, test } from 'bun:test'
import { parseLines } from './lines.ts'

describe('parseLines', () => {
  test('キーと値を取り出す', () => {
    const fields = parseLines('FN:山田太郎\nTEL:0901234567')
    expect(fields.get('FN')).toBe('山田太郎')
    expect(fields.get('TEL')).toBe('0901234567')
  })

  test('パラメータ付きのキーはパラメータを読み捨てる', () => {
    const fields = parseLines('TEL;TYPE=CELL:0901234567')
    expect(fields.get('TEL')).toBe('0901234567')
  })

  test('キーは大文字化して扱う', () => {
    const fields = parseLines('fn:山田太郎')
    expect(fields.get('FN')).toBe('山田太郎')
  })

  test('\\r\\n 区切りでも読める', () => {
    const fields = parseLines('FN:山田太郎\r\nTEL:0901234567')
    expect(fields.get('TEL')).toBe('0901234567')
  })

  test('同じキーが複数あれば最初の値を採用する', () => {
    const fields = parseLines('TEL:111\nTEL:222')
    expect(fields.get('TEL')).toBe('111')
  })

  /** 壊れた入力: コロンが無い行 */
  test('コロンが無い行は無視して例外を投げない', () => {
    const fields = parseLines('FN山田太郎\nTEL:0901234567')
    expect(fields.get('TEL')).toBe('0901234567')
    expect(fields.size).toBe(1)
  })

  /** 壊れた入力: 空文字列 */
  test('空文字列は空の Map になる', () => {
    expect(parseLines('').size).toBe(0)
  })
})
