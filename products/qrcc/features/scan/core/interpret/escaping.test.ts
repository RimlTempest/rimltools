import { describe, expect, test } from 'bun:test'
import { splitUnescaped, unescapeField } from './escaping.ts'

describe('splitUnescaped', () => {
  test('区切り文字で分割する', () => {
    expect(splitUnescaped('a;b;c', ';')).toEqual(['a', 'b', 'c'])
  })

  test('エスケープされた区切り文字では分割しない', () => {
    expect(splitUnescaped('a\\;b;c', ';')).toEqual(['a\\;b', 'c'])
  })

  test('末尾が区切り文字なら空文字列の要素になる', () => {
    expect(splitUnescaped('a;;', ';')).toEqual(['a', '', ''])
  })

  test('空文字列は要素 1 つの空配列相当を返す', () => {
    expect(splitUnescaped('', ';')).toEqual([''])
  })
})

describe('unescapeField', () => {
  test('エスケープを外す', () => {
    expect(unescapeField('My\\;Net')).toBe('My;Net')
  })

  test('エスケープが無ければそのまま', () => {
    expect(unescapeField('MyNet')).toBe('MyNet')
  })

  test('末尾がバックスラッシュだけでも例外を投げない', () => {
    expect(unescapeField('MyNet\\')).toBe('MyNet')
  })
})
