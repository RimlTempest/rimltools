import { describe, expect, test } from 'bun:test'
import { interpretTel } from './tel.ts'

describe('interpretTel', () => {
  test('tel: に続く番号を取り出す', () => {
    expect(interpretTel('tel:+819012345678')).toEqual({ kind: 'tel', number: '+819012345678' })
  })

  test('大文字小文字を問わない', () => {
    expect(interpretTel('TEL:0312345678')).toEqual({ kind: 'tel', number: '0312345678' })
  })

  test('tel: で始まらなければ何も返さない', () => {
    expect(interpretTel('0312345678')).toBeUndefined()
  })

  /** 壊れた入力: 番号が空 */
  test('番号が空なら何も返さない', () => {
    expect(interpretTel('tel:')).toBeUndefined()
  })

  /** 壊れた入力: 空白しかない */
  test('空白だけの番号は空として扱う', () => {
    expect(interpretTel('tel:   ')).toBeUndefined()
  })
})
