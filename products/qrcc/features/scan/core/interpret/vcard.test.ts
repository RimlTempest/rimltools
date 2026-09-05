import { describe, expect, test } from 'bun:test'
import { interpretVcard } from './vcard.ts'

describe('interpretVcard', () => {
  test('FN・TEL・EMAIL・ORG を取り出す', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:山田太郎',
      'TEL:0901234567',
      'EMAIL:taro@example.com',
      'ORG:Example',
      'END:VCARD',
    ].join('\n')
    expect(interpretVcard(text)).toEqual({
      kind: 'contact',
      fields: { name: '山田太郎', tel: '0901234567', email: 'taro@example.com', org: 'Example' },
    })
  })

  test('FN が無ければ N から組み立てる', () => {
    const text = ['BEGIN:VCARD', 'N:山田;太郎;;;', 'END:VCARD'].join('\n')
    expect(interpretVcard(text)).toEqual({
      kind: 'contact',
      fields: { name: '山田 太郎', tel: undefined, email: undefined, org: undefined },
    })
  })

  test('FN があれば N より優先する', () => {
    const text = ['BEGIN:VCARD', 'N:山田;太郎;;;', 'FN:太郎山田', 'END:VCARD'].join('\n')
    const result = interpretVcard(text)
    expect(result?.kind === 'contact' ? result.fields.name : undefined).toBe('太郎山田')
  })

  test('パラメータ付きの TEL でも読める', () => {
    const text = ['BEGIN:VCARD', 'TEL;TYPE=CELL:0901234567', 'END:VCARD'].join('\n')
    expect(interpretVcard(text)).toEqual({
      kind: 'contact',
      fields: { name: undefined, tel: '0901234567', email: undefined, org: undefined },
    })
  })

  test('BEGIN:VCARD で始まらなければ何も返さない', () => {
    expect(interpretVcard('FN:山田太郎')).toBeUndefined()
  })

  /** 壊れた入力: END:VCARD が無い（途中で切れている） */
  test('END:VCARD が無くても読める', () => {
    const text = ['BEGIN:VCARD', 'FN:山田太郎'].join('\n')
    expect(interpretVcard(text)).toEqual({
      kind: 'contact',
      fields: { name: '山田太郎', tel: undefined, email: undefined, org: undefined },
    })
  })

  /** 壊れた入力: 値が空 */
  test('FN も N も無ければ氏名は undefined', () => {
    const text = ['BEGIN:VCARD', 'TEL:0901234567', 'END:VCARD'].join('\n')
    expect(interpretVcard(text)).toEqual({
      kind: 'contact',
      fields: { name: undefined, tel: '0901234567', email: undefined, org: undefined },
    })
  })
})
