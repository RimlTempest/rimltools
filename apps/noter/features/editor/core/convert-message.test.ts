import { describe, expect, test } from 'bun:test'
import { describeConvertError } from './convert-message.ts'

describe('describeConvertError', () => {
  test('構文エラーは問題パネルへ誘導する', () => {
    const message = describeConvertError({ reason: 'parse', diagnostics: [] }, 'TOML')
    expect(message).toContain('問題')
  })

  test('トップレベルが表でないときは、その理由を言う', () => {
    const message = describeConvertError({ reason: 'not_object' }, 'TOML')
    expect(message).toBe('TOML にできません。いちばん外側がキーと値の集まりである必要があります。')
  })

  test('null を含むときは場所を示す', () => {
    const message = describeConvertError({ reason: 'null_value', path: '$.a.b' }, 'TOML')
    expect(message).toBe(
      'TOML にできません。$.a.b の値が空です。値を入れるか、その項目を消してください。',
    )
  })

  test('書き出せない値は、その形式で表せないことを言う', () => {
    const message = describeConvertError({ reason: 'stringify', diagnostics: [] }, 'YAML')
    expect(message).toBe('YAML にできません。この形式で表せない値が含まれています。')
  })
})
