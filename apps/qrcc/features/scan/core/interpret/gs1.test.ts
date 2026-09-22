import { describe, expect, test } from 'bun:test'
import { interpretGs1 } from './gs1.ts'

describe('interpretGs1', () => {
  test('固定長 AI どうしの連結（01 + 17 + 10、10 は末尾なので区切り不要）', () => {
    expect(interpretGs1('0104912345678904172512311012345')).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '01', kind: 'gtin', gtin: '04912345678904' },
        { ai: '17', kind: 'expiry_date', date: '251231' },
        { ai: '10', kind: 'lot', lot: '12345' },
      ],
    })
  })

  test('可変長 AI のあとに別の AI が続くときは区切り文字（GS）が要る', () => {
    const GS = '\x1d'
    expect(interpretGs1(`10ABC123${GS}21XYZ99`)).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '10', kind: 'lot', lot: 'ABC123' },
        { ai: '21', kind: 'serial', serial: 'XYZ99' },
      ],
    })
  })

  test('単独の GTIN だけでもよい', () => {
    expect(interpretGs1('0104912345678904')).toEqual({
      kind: 'gs1',
      elements: [{ ai: '01', kind: 'gtin', gtin: '04912345678904' }],
    })
  })

  test('製造日と有効期限（どちらも固定長 6 桁）を連結できる', () => {
    expect(interpretGs1('1125010117251231')).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '11', kind: 'production_date', date: '250101' },
        { ai: '17', kind: 'expiry_date', date: '251231' },
      ],
    })
  })

  test('知らない AI は unknown として値だけ持つ', () => {
    // 90 は GS1 では「内部情報」の AI だが、この計画では未対応
    expect(interpretGs1('010491234567890490INTERNAL')).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '01', kind: 'gtin', gtin: '04912345678904' },
        { ai: '90', kind: 'unknown', value: 'INTERNAL' },
      ],
    })
  })

  test(']C1 のシンボル体系識別子が付いていても読める', () => {
    expect(interpretGs1(']C10104912345678904')).toEqual({
      kind: 'gs1',
      elements: [{ ai: '01', kind: 'gtin', gtin: '04912345678904' }],
    })
  })

  test(']e0 のシンボル体系識別子が付いていても読める', () => {
    expect(interpretGs1(']e00104912345678904')).toEqual({
      kind: 'gs1',
      elements: [{ ai: '01', kind: 'gtin', gtin: '04912345678904' }],
    })
  })

  test('対応している AI で始まらなければ GS1 として扱わない', () => {
    expect(interpretGs1('99ABC')).toBeUndefined()
  })

  test('数字で始まらなければ GS1 として扱わない', () => {
    expect(interpretGs1('在庫-0001')).toBeUndefined()
  })

  /** 壊れた入力: 途中で切れている（固定長 AI の桁が足りない） */
  test('GTIN が途中で切れていれば GS1 として扱わない', () => {
    expect(interpretGs1('01049123')).toBeUndefined()
  })

  /** 壊れた入力: 区切りが無い（可変長のあとに区切りなしで別データが続く） */
  test('可変長 AI のあとに区切りが無ければ、残り全部をその値として扱い例外を投げない', () => {
    expect(interpretGs1('10ABC12321XYZ99')).toEqual({
      kind: 'gs1',
      elements: [{ ai: '10', kind: 'lot', lot: 'ABC12321XYZ99' }],
    })
  })

  /** 壊れた入力: 値が空（可変長 AI が空のまま終わる） */
  test('可変長 AI の値が空でも例外を投げない', () => {
    expect(interpretGs1('010491234567890410')).toEqual({
      kind: 'gs1',
      elements: [
        { ai: '01', kind: 'gtin', gtin: '04912345678904' },
        { ai: '10', kind: 'lot', lot: '' },
      ],
    })
  })

  test('空文字列は GS1 として扱わない', () => {
    expect(interpretGs1('')).toBeUndefined()
  })
})
