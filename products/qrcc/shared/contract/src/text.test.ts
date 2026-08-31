import { describe, expect, test } from 'bun:test'
import { isErr, isOk } from './result.ts'
import {
  parseEmailAddress,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
} from './text.ts'

describe('NonEmptyText', () => {
  test('可視文字があれば受け付ける', () => {
    expect(isOk(parseNonEmptyText('在庫ラベル'))).toBe(true)
  })

  test('空文字と空白のみを拒否する', () => {
    for (const bad of ['', '   ', '\t\n', '　']) {
      expect(isErr(parseNonEmptyText(bad))).toBe(true)
    }
  })

  test('前後の空白を含んでいても、中身があれば受け付ける', () => {
    expect(isOk(parseNonEmptyText('  名前  '))).toBe(true)
  })
})

describe('HttpUrl', () => {
  test('http と https を受け付ける', () => {
    expect(isOk(parseHttpUrl('https://example.com/a?b=1'))).toBe(true)
    expect(isOk(parseHttpUrl('http://example.com'))).toBe(true)
  })

  test('http 以外のスキームを拒否する', () => {
    for (const bad of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,x',
      'mailto:a@b.c',
    ]) {
      expect(isErr(parseHttpUrl(bad))).toBe(true)
    }
  })

  test('URL として壊れているものを拒否する', () => {
    expect(isErr(parseHttpUrl('not a url'))).toBe(true)
  })

  test('エラーは何が期待だったかを持つ', () => {
    const parsed = parseHttpUrl('javascript:alert(1)')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.kind).toBe('invalid_text')
  })
})

describe('EmailAddress', () => {
  test('一般的な形式を受け付ける', () => {
    expect(isOk(parseEmailAddress('riml.slime@example.com'))).toBe(true)
  })

  test('@ がない・空白を含むものを拒否する', () => {
    for (const bad of ['nope', 'a b@example.com', 'a@', '@example.com']) {
      expect(isErr(parseEmailAddress(bad))).toBe(true)
    }
  })
})

describe('PhoneNumber', () => {
  test('E.164 形式を受け付ける', () => {
    expect(isOk(parsePhoneNumber('+819012345678'))).toBe(true)
  })

  test('記号入りや短すぎるものを拒否する', () => {
    for (const bad of ['090-1234-5678', '+', '+0123', 'abc']) {
      expect(isErr(parsePhoneNumber(bad))).toBe(true)
    }
  })
})

describe('HexColor', () => {
  test('3 桁・6 桁・8 桁の小文字 16 進を受け付ける', () => {
    for (const good of ['#fff', '#00ff88', '#00ff8880']) {
      expect(isOk(parseHexColor(good))).toBe(true)
    }
  })

  test('# なし・大文字・桁数違いを拒否する', () => {
    for (const bad of ['fff', '#FFF', '#ffff', '#gggggg']) {
      expect(isErr(parseHexColor(bad))).toBe(true)
    }
  })
})
