import { describe, expect, test } from 'bun:test'
import { interpretSms } from './sms.ts'

describe('interpretSms', () => {
  test('SMSTO: の番号と本文を取り出す', () => {
    expect(interpretSms('SMSTO:09012345678:こんにちは')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: 'こんにちは',
    })
  })

  test('SMSTO: の本文に : が含まれてもよい', () => {
    expect(interpretSms('SMSTO:09012345678:10:30 に着きます')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: '10:30 に着きます',
    })
  })

  test('SMSTO: に本文が無くてもよい', () => {
    expect(interpretSms('SMSTO:09012345678')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: undefined,
    })
  })

  test('sms: URI 形式の番号と本文を取り出す', () => {
    expect(interpretSms('sms:09012345678?body=%E3%81%8A%E9%A1%98%E3%81%84')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: 'お願い',
    })
  })

  test('sms: URI 形式で body が無くてもよい', () => {
    expect(interpretSms('sms:09012345678')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: undefined,
    })
  })

  test('SMSTO: でも sms: でもなければ何も返さない', () => {
    expect(interpretSms('09012345678')).toBeUndefined()
  })

  /** 壊れた入力: 番号が空 */
  test('SMSTO: で番号が空なら何も返さない', () => {
    expect(interpretSms('SMSTO::こんにちは')).toBeUndefined()
  })

  /** 壊れた入力: 本文が空 */
  test('SMSTO: で本文の区切りだけあって本文が空なら undefined 扱いにする', () => {
    expect(interpretSms('SMSTO:09012345678:')).toEqual({
      kind: 'sms',
      number: '09012345678',
      body: undefined,
    })
  })

  /** 壊れた入力: 区切りが無い sms: URI */
  test('sms: URI で番号が空なら何も返さない', () => {
    expect(interpretSms('sms:?body=hi')).toBeUndefined()
  })
})
