import { describe, expect, test } from 'bun:test'
import type { DiffLine } from './diff-lines.ts'
import { MAX_DIFF_LINES, diffLines } from './diff-lines.ts'

/** 検証を読みやすくするための短縮表記（`+a` = 追加、`-a` = 削除、`a` = 同じ）。 */
const shorthand = (lines: readonly DiffLine[]): readonly string[] =>
  lines.map((line) => {
    if (line.kind === 'inserted') return `+${line.text}`
    if (line.kind === 'deleted') return `-${line.text}`
    return ` ${line.text}`
  })

/** 差分をたどると「変更前」と「変更後」の両方が復元できること。 */
const rebuild = (lines: readonly DiffLine[]) => ({
  before: lines
    .filter((line) => line.kind !== 'inserted')
    .map((line) => line.text)
    .join('\n'),
  after: lines
    .filter((line) => line.kind !== 'deleted')
    .map((line) => line.text)
    .join('\n'),
})

describe('diffLines', () => {
  test('同じ本文なら全部 equal', () => {
    expect(shorthand(diffLines('a\nb\nc', 'a\nb\nc'))).toEqual([' a', ' b', ' c'])
  })

  test('行の追加', () => {
    expect(shorthand(diffLines('a\nc', 'a\nb\nc'))).toEqual([' a', '+b', ' c'])
  })

  test('行の削除', () => {
    expect(shorthand(diffLines('a\nb\nc', 'a\nc'))).toEqual([' a', '-b', ' c'])
  })

  test('行の置き換えは削除と追加で表す', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc')
    expect(shorthand(lines).filter((line) => !line.startsWith(' '))).toEqual(['-b', '+B'])
    expect(rebuild(lines)).toEqual({ before: 'a\nb\nc', after: 'a\nB\nc' })
  })

  test('空文書から書き始めると全部 inserted', () => {
    expect(shorthand(diffLines('', 'a\nb'))).toEqual(['+a', '+b'])
  })

  test('全部消すと全部 deleted', () => {
    expect(shorthand(diffLines('a\nb', ''))).toEqual(['-a', '-b'])
  })

  test('両方空なら差分は無い', () => {
    expect(diffLines('', '')).toEqual([])
  })

  test('末尾の空行も 1 行として扱う', () => {
    expect(shorthand(diffLines('a', 'a\n'))).toEqual([' a', '+'])
  })

  test('先頭も末尾も違う本文でも、前後を復元できる', () => {
    const lines = diffLines('x\na\nb\ny', 'z\na\nb\nw')
    expect(rebuild(lines)).toEqual({ before: 'x\na\nb\ny', after: 'z\na\nb\nw' })
  })

  test('上限を超える本文は「まるごと置き換え」に落とす（計算量を抑える）', () => {
    const before = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `a${i}`).join('\n')
    const after = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `b${i}`).join('\n')
    const lines = diffLines(before, after)
    expect(lines.every((line) => line.kind !== 'equal')).toBe(true)
    expect(lines.filter((line) => line.kind === 'deleted')).toHaveLength(MAX_DIFF_LINES + 1)
    expect(lines.filter((line) => line.kind === 'inserted')).toHaveLength(MAX_DIFF_LINES + 1)
    expect(rebuild(lines)).toEqual({ before, after })
  })

  test('上限を超えていても、前後の同じ行はそのまま残る', () => {
    const middleBefore = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `a${i}`)
    const middleAfter = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `b${i}`)
    const lines = diffLines(
      ['頭', ...middleBefore, '尾'].join('\n'),
      ['頭', ...middleAfter, '尾'].join('\n'),
    )
    expect(lines[0]).toEqual({ kind: 'equal', text: '頭' })
    expect(lines.at(-1)).toEqual({ kind: 'equal', text: '尾' })
  })
})
