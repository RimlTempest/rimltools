import { describe, expect, test } from 'bun:test'
import { positionAt } from './position.ts'

describe('positionAt', () => {
  test('先頭は 1 行 1 列（0 始まりではない）', () => {
    expect(positionAt('abc', 0)).toEqual({ line: 1, column: 1 })
  })

  test('同じ行の中ではオフセットの分だけ列が進む', () => {
    expect(positionAt('abc', 2)).toEqual({ line: 1, column: 3 })
  })

  test('3 行目の先頭を 3 行 1 列として返す（行と列を取り違えない）', () => {
    const text = 'a\nbb\nccc\n'
    expect(positionAt(text, 5)).toEqual({ line: 3, column: 1 })
  })

  test('3 行目の途中は列だけが進む', () => {
    const text = 'a\nbb\nccc\n'
    expect(positionAt(text, 7)).toEqual({ line: 3, column: 3 })
  })

  test('CRLF は 1 つの改行として数える', () => {
    const text = 'a\r\nb\r\nc'
    expect(positionAt(text, 6)).toEqual({ line: 3, column: 1 })
  })

  test('CR だけの改行も 1 行として数える', () => {
    expect(positionAt('a\rb', 2)).toEqual({ line: 2, column: 1 })
  })

  test('末尾を越えたオフセットは末尾に丸める', () => {
    expect(positionAt('ab', 99)).toEqual({ line: 1, column: 3 })
  })

  test('負のオフセットは先頭に丸める', () => {
    expect(positionAt('ab', -5)).toEqual({ line: 1, column: 1 })
  })

  test('空文字列は 1 行 1 列', () => {
    expect(positionAt('', 0)).toEqual({ line: 1, column: 1 })
  })
})
