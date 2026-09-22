import { describe, expect, test } from 'bun:test'
import type { Ok, Result } from '@qrcc/contract'
import { isOk, parseHttpUrl } from '@qrcc/contract'
import { interpret } from './index.ts'

/** テスト固定値が壊れていたら、その場でテストを失敗させて気づけるようにする。 */
function assertOk<T, E>(result: Result<T, E>): asserts result is Ok<T> {
  expect(isOk(result)).toBe(true)
}

/** テストの固定値専用。 */
const httpUrl = (text: string) => {
  const parsed = parseHttpUrl(text)
  assertOk(parsed)
  return parsed.value
}

describe('interpret（振り分け）', () => {
  test('どの形式にも当てはまらなければ plain になる', () => {
    expect(interpret('在庫-0001')).toEqual({ kind: 'plain', text: '在庫-0001' })
  })

  test('空文字列でも例外を投げず plain を返す', () => {
    expect(interpret('')).toEqual({ kind: 'plain', text: '' })
  })

  test('http(s) は url になる', () => {
    expect(interpret('https://qrcc.riml4i.com/a')).toEqual({
      kind: 'url',
      url: httpUrl('https://qrcc.riml4i.com/a'),
    })
  })

  test('javascript: など http(s) 以外は url にならず plain になる', () => {
    expect(interpret('javascript:alert(1)')).toEqual({
      kind: 'plain',
      text: 'javascript:alert(1)',
    })
  })

  test('tel: は tel になる', () => {
    expect(interpret('tel:+819012345678')).toEqual({ kind: 'tel', number: '+819012345678' })
  })

  test('mailto: は email になる', () => {
    expect(interpret('mailto:sato@example.com?subject=%E4%BB%B6%E5%90%8D')).toEqual({
      kind: 'email',
      to: 'sato@example.com',
      subject: '件名',
    })
  })

  test('SMSTO: は sms になる', () => {
    expect(interpret('SMSTO:09012345678:こんにちは')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: 'こんにちは',
    })
  })

  test('geo: は geo になる', () => {
    expect(interpret('geo:35.681236,139.767125')).toEqual({
      kind: 'geo',
      lat: 35.681236,
      lon: 139.767125,
    })
  })

  test('WIFI: は wifi になる', () => {
    expect(interpret('WIFI:S:MyNet;T:WPA;P:secret;;')).toEqual({
      kind: 'wifi',
      ssid: 'MyNet',
      auth: 'WPA',
      password: 'secret',
    })
  })

  test('MECARD: は contact になる', () => {
    expect(
      interpret('MECARD:N:山田太郎;TEL:0901234567;EMAIL:taro@example.com;ORG:Example;;'),
    ).toEqual({
      kind: 'contact',
      fields: {
        name: '山田太郎',
        tel: '0901234567',
        email: 'taro@example.com',
        org: 'Example',
      },
    })
  })

  test('BEGIN:VCARD は contact になる', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:山田太郎', 'TEL:0901234567', 'END:VCARD'].join(
      '\n',
    )
    expect(interpret(text)).toEqual({
      kind: 'contact',
      fields: { name: '山田太郎', tel: '0901234567', email: undefined, org: undefined },
    })
  })

  test('BEGIN:VEVENT を含めば event になる', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:定例会議',
      'DTSTART:20260901T090000Z',
      'DTEND:20260901T100000Z',
      'LOCATION:会議室1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(interpret(text)).toEqual({
      kind: 'event',
      summary: '定例会議',
      start: '20260901T090000Z',
      end: '20260901T100000Z',
      location: '会議室1',
    })
  })

  test('GS1 の要素文字列は gs1 になる', () => {
    // 01(GTIN,14桁) + 17(有効期限,6桁) + 10(ロット, 可変長・末尾)
    expect(interpret('0104912345678904172512311012345')).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '01', kind: 'gtin', gtin: '04912345678904' },
        { ai: '17', kind: 'expiry_date', date: '251231' },
        { ai: '10', kind: 'lot', lot: '12345' },
      ],
    })
  })
})
