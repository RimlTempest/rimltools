import { describe, expect, test } from 'bun:test'
import { MAX_DOCUMENT_BYTES } from '@noter/contract'
import { describeImportError } from '../contract/index.ts'
import { byteLength, checkImportSize } from './import-guard.ts'

describe('byteLength', () => {
  test('UTF-8 のバイト数を数える（文字数ではない）', () => {
    expect(byteLength('')).toBe(0)
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('あ')).toBe(3)
    expect(byteLength('🙂')).toBe(4)
  })
})

describe('checkImportSize', () => {
  test('上限ちょうどは通す', () => {
    expect(checkImportSize(MAX_DOCUMENT_BYTES).ok).toBe(true)
  })

  test('上限 + 1 は拒否し、理由を返す', () => {
    const result = checkImportSize(MAX_DOCUMENT_BYTES + 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual({
      kind: 'too_large',
      max: MAX_DOCUMENT_BYTES,
      bytes: MAX_DOCUMENT_BYTES + 1,
    })
  })

  test('空でも通す', () => {
    expect(checkImportSize(0).ok).toBe(true)
  })
})

describe('describeImportError', () => {
  test('何が起きたか・次にできることを書く', () => {
    const message = describeImportError({
      kind: 'too_large',
      max: MAX_DOCUMENT_BYTES,
      bytes: MAX_DOCUMENT_BYTES * 2,
    })
    expect(message).toContain('1.0 MB')
    expect(message).toContain('2.0 MB')
    expect(message).toContain('分割')
  })
})
