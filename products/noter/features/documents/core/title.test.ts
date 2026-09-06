import { describe, expect, test } from 'bun:test'
import { MAX_TITLE_LENGTH } from '@noter/contract'
import { DEFAULT_TITLE, normalizeTitle } from './title.ts'

describe('normalizeTitle', () => {
  test('前後の空白を落とす', () => {
    expect(normalizeTitle('  設計メモ  ')).toEqual({ ok: true, value: '設計メモ' })
  })

  test('空文字は empty', () => {
    expect(normalizeTitle('')).toEqual({ ok: false, error: 'empty' })
  })

  test('空白だけも empty', () => {
    expect(normalizeTitle(' \t\n ')).toEqual({ ok: false, error: 'empty' })
  })

  test(`${MAX_TITLE_LENGTH} 文字ちょうどは通る（境界）`, () => {
    const title = 'あ'.repeat(MAX_TITLE_LENGTH)
    expect(normalizeTitle(title)).toEqual({ ok: true, value: title })
  })

  test(`${MAX_TITLE_LENGTH + 1} 文字は too_long（境界）`, () => {
    expect(normalizeTitle('あ'.repeat(MAX_TITLE_LENGTH + 1))).toEqual({
      ok: false,
      error: 'too_long',
    })
  })

  /** 絵文字（サロゲートペア）を 2 文字と数えると、見た目より早く弾かれる。 */
  test('文字数はコードポイントで数える', () => {
    expect(normalizeTitle('🙂'.repeat(MAX_TITLE_LENGTH)).ok).toBe(true)
  })

  test('既定のタイトルはそのまま通る', () => {
    expect(normalizeTitle(DEFAULT_TITLE)).toEqual({ ok: true, value: DEFAULT_TITLE })
  })
})
