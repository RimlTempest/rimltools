import { describe, expect, test } from 'bun:test'
import { rangeAt } from './text-range.ts'

/** CodeMirror の `Text` と同じ形（1 始まりの行を from / to で返す）の偽物。 */
const docOf = (text: string) => {
  const texts = text.split('\n')
  const froms: number[] = []
  let offset = 0
  for (const line of texts) {
    froms.push(offset)
    offset += line.length + 1
  }
  return {
    lines: texts.length,
    line: (number: number) => {
      const index = number - 1
      const from = froms[index] ?? 0
      return { from, to: from + (texts[index] ?? '').length }
    },
  }
}

describe('rangeAt', () => {
  const doc = docOf('abc\ndefgh\n\nij')

  test('1 始まりの行・列を文書内の位置に直す', () => {
    expect(rangeAt(doc, 1, 1)).toEqual({ from: 0, to: 3 })
    expect(rangeAt(doc, 2, 3)).toEqual({ from: 6, to: 9 })
  })

  test('その行の終わりまでを範囲にする', () => {
    expect(rangeAt(doc, 2, 1).to).toBe(9)
  })

  test('最終行より後ろの行は最終行に丸める', () => {
    expect(rangeAt(doc, 99, 1)).toEqual({ from: 11, to: 13 })
  })

  test('0 行目・負の行は先頭行に丸める', () => {
    expect(rangeAt(doc, 0, 1)).toEqual({ from: 0, to: 3 })
    expect(rangeAt(doc, -5, 1)).toEqual({ from: 0, to: 3 })
  })

  test('行の長さを超える列は行末に丸める', () => {
    expect(rangeAt(doc, 1, 99)).toEqual({ from: 3, to: 3 })
  })

  test('0 列・負の列は行頭に丸める', () => {
    expect(rangeAt(doc, 2, 0)).toEqual({ from: 4, to: 9 })
    expect(rangeAt(doc, 2, -3)).toEqual({ from: 4, to: 9 })
  })

  test('空行では開始と終了が同じ位置になる', () => {
    expect(rangeAt(doc, 3, 1)).toEqual({ from: 10, to: 10 })
  })

  test('数でない行・列は先頭に丸める', () => {
    expect(rangeAt(doc, Number.NaN, Number.NaN)).toEqual({ from: 0, to: 3 })
  })

  test('小数は切り捨てる', () => {
    expect(rangeAt(doc, 2.7, 3.9)).toEqual({ from: 6, to: 9 })
  })
})
