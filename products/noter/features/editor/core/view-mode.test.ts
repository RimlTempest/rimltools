import { describe, expect, test } from 'bun:test'
import { VIEW_MODES } from '../contract/index.ts'
import { defaultViewMode, nextViewMode, parseViewMode } from './view-mode.ts'

describe('defaultViewMode', () => {
  test('48rem 以上なら分割', () => {
    expect(defaultViewMode(768)).toBe('split')
    expect(defaultViewMode(1280)).toBe('split')
  })

  test('48rem 未満はエディタのみ', () => {
    expect(defaultViewMode(767)).toBe('editor')
    expect(defaultViewMode(320)).toBe('editor')
    expect(defaultViewMode(0)).toBe('editor')
  })
})

describe('nextViewMode', () => {
  test('エディタ → 分割 → プレビュー → エディタ の順に巡る', () => {
    expect(nextViewMode('editor')).toBe('split')
    expect(nextViewMode('split')).toBe('preview')
    expect(nextViewMode('preview')).toBe('editor')
  })

  test('3 回で元に戻る', () => {
    for (const mode of VIEW_MODES) {
      expect(nextViewMode(nextViewMode(nextViewMode(mode)))).toBe(mode)
    }
  })
})

describe('parseViewMode', () => {
  test('保存された値を読み戻す', () => {
    for (const mode of VIEW_MODES) expect(parseViewMode(mode)).toBe(mode)
  })

  test('読めない値は undefined', () => {
    expect(parseViewMode('both')).toBeUndefined()
    expect(parseViewMode(null)).toBeUndefined()
    expect(parseViewMode(undefined)).toBeUndefined()
    expect(parseViewMode(3)).toBeUndefined()
  })
})
