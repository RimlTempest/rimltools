import { describe, expect, test } from 'bun:test'
import {
  parseEmailAddress,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
} from '@qrcc/contract'
import { buildVCardPayload } from './vcard.ts'

describe('buildVCardPayload', () => {
  test('全項目から組み立てる', () => {
    const result = buildVCardPayload({
      name: '山田太郎',
      organization: '株式会社サンプル',
      tel: '+819012345678',
      email: 'yamada@example.com',
      url: 'https://example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const name = parseNonEmptyText('山田太郎')
    const tel = parsePhoneNumber('+819012345678')
    const email = parseEmailAddress('yamada@example.com')
    const url = parseHttpUrl('https://example.com')
    expect(name.ok && tel.ok && email.ok && url.ok).toBe(true)
    if (name.ok && tel.ok && email.ok && url.ok) {
      expect(result.value).toEqual({
        kind: 'vcard',
        card: {
          name: name.value,
          organization: '株式会社サンプル',
          tel: tel.value,
          email: email.value,
          url: url.value,
        },
      })
    }
  })

  test('氏名だけでも組み立てられる（他は任意）', () => {
    const result = buildVCardPayload({
      name: '山田太郎',
      organization: '',
      tel: '',
      email: '',
      url: '',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.card.tel).toBeUndefined()
    expect(result.value.card.email).toBeUndefined()
    expect(result.value.card.url).toBeUndefined()
  })

  test('氏名が空なら失敗する', () => {
    const result = buildVCardPayload({ name: '', organization: '', tel: '', email: '', url: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_name')
  })

  test('電話番号が不正なら失敗する', () => {
    const result = buildVCardPayload({
      name: '山田太郎',
      organization: '',
      tel: '090-1234-5678',
      email: '',
      url: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_tel')
  })

  test('メールアドレスが不正なら失敗する', () => {
    const result = buildVCardPayload({
      name: '山田太郎',
      organization: '',
      tel: '',
      email: 'not-an-email',
      url: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_email')
  })

  test('URL が不正なら失敗する', () => {
    const result = buildVCardPayload({
      name: '山田太郎',
      organization: '',
      tel: '',
      email: '',
      url: 'not-a-url',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_url')
  })
})
