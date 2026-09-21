import { describe, expect, test } from 'bun:test'

import type { Brand } from './brand.ts'
import type { RandomBytes } from './id.ts'
import {
  ID_BODY_LENGTH,
  hasPrefixedShape,
  issuePrefixed,
  newUserId,
  parseUserId,
  prefixedIdParser,
  previewReceived,
} from './id.ts'
import { isErr, isOk } from './result.ts'

type WidgetId = Brand<string, 'WidgetId'>
const isWidgetId = (value: string): value is WidgetId => hasPrefixedShape('wdg', value)
const parseWidgetId = prefixedIdParser('wdg', isWidgetId)
const newWidgetId = issuePrefixed('wdg', parseWidgetId)

const fixedRandom =
  (byte: number): RandomBytes =>
  (length) =>
    new Uint8Array(length).fill(byte)

const body = '0123456789abcdefghjkmnpq'

describe('接頭辞付き ID の部品', () => {
  test('本体は 24 文字の Crockford base32', () => {
    expect(ID_BODY_LENGTH).toBe(24)
    expect(isOk(parseWidgetId(`wdg_${body}`))).toBe(true)
  })

  test('接頭辞・長さ・文字集合が違うものを拒否する', () => {
    expect(isErr(parseWidgetId(`usr_${body}`))).toBe(true)
    expect(isErr(parseWidgetId(`wdg_${body.slice(1)}`))).toBe(true)
    expect(isErr(parseWidgetId(`wdg_${body.slice(1)}i`))).toBe(true)
    expect(isErr(parseWidgetId(`wdg_${body.toUpperCase()}`))).toBe(true)
  })

  test('エラーは期待した形と切り詰めた入力を持つ', () => {
    const result = parseWidgetId('x'.repeat(100))
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid_id',
        expected: 'wdg_ followed by 24 Crockford base32 characters',
        received: `${'x'.repeat(32)}…`,
      },
    })
  })

  test('発行した ID は同じパーサを通り、乱数が同じなら同じ ID', () => {
    const a = newWidgetId(fixedRandom(7))
    const b = newWidgetId(fixedRandom(7))
    const c = newWidgetId(fixedRandom(8))
    expect(isOk(a)).toBe(true)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    if (!a.ok) return
    expect(a.value.startsWith('wdg_')).toBe(true)
    expect(a.value.length).toBe(4 + ID_BODY_LENGTH)
  })

  test('previewReceived は 32 文字を超える入力を切り詰める', () => {
    expect(previewReceived('short')).toBe('short')
    expect(previewReceived('y'.repeat(33))).toBe(`${'y'.repeat(32)}…`)
  })
})

describe('UserId（全プロダクト共通）', () => {
  test('usr_ 接頭辞で発行・パースできる', () => {
    const issued = newUserId(fixedRandom(1))
    expect(isOk(issued)).toBe(true)
    if (!issued.ok) return
    expect(isOk(parseUserId(issued.value))).toBe(true)
    expect(isErr(parseUserId(`wdg_${body}`))).toBe(true)
  })
})
