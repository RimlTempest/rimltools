import { describe, expect, test } from 'bun:test'
import { parseItemLines } from './items.ts'

describe('parseItemLines', () => {
  test('1 行 1 コードとして読む', () => {
    expect(parseItemLines('https://example.com\nhttps://example.org', 1)).toEqual([
      { name: '', content: 'https://example.com', copies: 1 },
      { name: '', content: 'https://example.org', copies: 1 },
    ])
  })

  test('タブより前を名前として読む（表計算からの貼り付け）', () => {
    expect(parseItemLines('会議室 A\thttps://example.com/a', 2)).toEqual([
      { name: '会議室 A', content: 'https://example.com/a', copies: 2 },
    ])
  })

  test('タブが 2 つ以上あっても、内容側は切らない', () => {
    expect(parseItemLines('名前\ta\tb', 1)).toEqual([{ name: '名前', content: 'a\tb', copies: 1 }])
  })

  test('空行と前後の空白は捨てる', () => {
    expect(parseItemLines('  a  \n\n\n  b\n', 1)).toEqual([
      { name: '', content: 'a', copies: 1 },
      { name: '', content: 'b', copies: 1 },
    ])
  })

  test('改行コードが CRLF でも読める', () => {
    expect(parseItemLines('a\r\nb', 1)).toHaveLength(2)
  })

  test('何も入っていなければ 0 件', () => {
    expect(parseItemLines('   \n\n', 1)).toEqual([])
  })

  test('内容が空で名前だけの行は捨てる（刷るものが無いため）', () => {
    expect(parseItemLines('名前だけ\t', 1)).toEqual([])
  })
})
