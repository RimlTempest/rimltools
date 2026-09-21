import { describe, expect, test } from 'bun:test'
import type { PrintItem } from '../contract/index.ts'
import { captionFor } from './caption.ts'

const item: PrintItem = { name: '会議室 A', content: 'https://example.com/a', copies: 1 }

describe('captionFor', () => {
  test('「なし」なら文字を出さない', () => {
    expect(captionFor(item, { kind: 'none' })).toBeUndefined()
  })

  test('「コード名」なら名前を出す', () => {
    expect(captionFor(item, { kind: 'name' })).toBe('会議室 A')
  })

  test('名前が無い行では内容で代用する（空のラベルを作らない）', () => {
    expect(captionFor({ ...item, name: '' }, { kind: 'name' })).toBe('https://example.com/a')
  })

  test('「内容」ならエンコードした内容を出す', () => {
    expect(captionFor(item, { kind: 'content' })).toBe('https://example.com/a')
  })

  test('「共通の文字」なら全ラベルに同じ文字を出す', () => {
    expect(captionFor(item, { kind: 'custom', text: '備品管理' })).toBe('備品管理')
  })

  test('共通の文字が空なら出さない', () => {
    expect(captionFor(item, { kind: 'custom', text: '  ' })).toBeUndefined()
  })
})
