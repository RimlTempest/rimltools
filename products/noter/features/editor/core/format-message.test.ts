import { describe, expect, test } from 'bun:test'
import { formatMessage } from './format-message.ts'

describe('formatMessage', () => {
  test('整形できたことを伝える', () => {
    expect(formatMessage('formatted')).toBe('整形しました。')
  })

  test('変わらなかったときは、そう伝える', () => {
    expect(formatMessage('unchanged')).toBe('すでに整形されています。')
  })

  test('失敗したときは次にできることまで伝える', () => {
    expect(formatMessage('failed')).toBe(
      '整形できません。問題を開いて、指摘された行を直してください。',
    )
  })
})
