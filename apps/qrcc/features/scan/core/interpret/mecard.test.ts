import { describe, expect, test } from 'bun:test'
import { interpretMecard } from './mecard.ts'

describe('interpretMecard', () => {
  test('氏名・電話・メール・組織を取り出す', () => {
    expect(
      interpretMecard('MECARD:N:山田,太郎;TEL:0901234567;EMAIL:taro@example.com;ORG:Example;;'),
    ).toEqual({
      kind: 'contact',
      fields: { name: '山田 太郎', tel: '0901234567', email: 'taro@example.com', org: 'Example' },
    })
  })

  test('無い項目は undefined になる', () => {
    expect(interpretMecard('MECARD:N:山田太郎;;')).toEqual({
      kind: 'contact',
      fields: { name: '山田太郎', tel: undefined, email: undefined, org: undefined },
    })
  })

  test('MECARD: で始まらなければ何も返さない', () => {
    expect(interpretMecard('N:山田太郎;;')).toBeUndefined()
  })

  /** 壊れた入力: 区切りが無い */
  test('区切りが無ければどの項目も空として扱い、例外を投げない', () => {
    expect(interpretMecard('MECARD:N山田太郎')).toEqual({
      kind: 'contact',
      fields: { name: undefined, tel: undefined, email: undefined, org: undefined },
    })
  })

  /** 壊れた入力: 値が空 */
  test('氏名が空でも例外を投げない', () => {
    expect(interpretMecard('MECARD:N:;TEL:0901234567;;')).toEqual({
      kind: 'contact',
      fields: { name: undefined, tel: '0901234567', email: undefined, org: undefined },
    })
  })

  /** 壊れた入力: 途中で切れている（末尾の ;; が無い） */
  test('末尾の ;; が無くても読める', () => {
    expect(interpretMecard('MECARD:N:山田太郎;TEL:0901234567')).toEqual({
      kind: 'contact',
      fields: { name: '山田太郎', tel: '0901234567', email: undefined, org: undefined },
    })
  })
})
