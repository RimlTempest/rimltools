import { describe, expect, test } from 'bun:test'
import { interpretMailto } from './mailto.ts'

describe('interpretMailto', () => {
  test('宛先だけを取り出す', () => {
    expect(interpretMailto('mailto:sato@example.com')).toEqual({
      kind: 'email',
      to: 'sato@example.com',
      subject: undefined,
    })
  })

  test('件名をデコードして取り出す', () => {
    expect(interpretMailto('mailto:sato@example.com?subject=%E4%BB%B6%E5%90%8D')).toEqual({
      kind: 'email',
      to: 'sato@example.com',
      subject: '件名',
    })
  })

  test('件名以外のクエリは無視する', () => {
    expect(interpretMailto('mailto:sato@example.com?body=hello&subject=Hi')).toEqual({
      kind: 'email',
      to: 'sato@example.com',
      subject: 'Hi',
    })
  })

  test('mailto: で始まらなければ何も返さない', () => {
    expect(interpretMailto('sato@example.com')).toBeUndefined()
  })

  /** 壊れた入力: 宛先が空 */
  test('宛先が空なら何も返さない', () => {
    expect(interpretMailto('mailto:?subject=Hi')).toBeUndefined()
  })

  /** 壊れた入力: 不正な % エンコード */
  test('壊れた % エンコードでも例外を投げない', () => {
    expect(interpretMailto('mailto:sato@example.com?subject=%')).toEqual({
      kind: 'email',
      to: 'sato@example.com',
      subject: '%',
    })
  })
})
