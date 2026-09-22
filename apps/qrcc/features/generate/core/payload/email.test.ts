import { describe, expect, test } from 'bun:test'
import { parseEmailAddress } from '@qrcc/contract'
import { buildEmailPayload } from './email.ts'

describe('buildEmailPayload', () => {
  test('宛先・件名・本文から組み立てる', () => {
    const result = buildEmailPayload({
      to: 'someone@example.com',
      subject: 'こんにちは',
      body: 'よろしくお願いします',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const to = parseEmailAddress('someone@example.com')
    expect(to.ok).toBe(true)
    if (to.ok) {
      expect(result.value).toEqual({
        kind: 'email',
        to: to.value,
        subject: 'こんにちは',
        body: 'よろしくお願いします',
      })
    }
  })

  test('件名も本文も空のまま組み立てられる', () => {
    const result = buildEmailPayload({ to: 'someone@example.com', subject: '', body: '' })
    expect(result.ok).toBe(true)
  })

  test('宛先が不正なら失敗する', () => {
    const result = buildEmailPayload({ to: 'not-an-email', subject: '', body: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_to')
  })

  test('宛先が空でも失敗する', () => {
    const result = buildEmailPayload({ to: '', subject: '件名', body: '' })
    expect(result.ok).toBe(false)
  })
})
