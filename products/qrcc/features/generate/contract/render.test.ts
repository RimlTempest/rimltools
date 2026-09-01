import { describe, expect, test } from 'bun:test'
import { decodeRenderResponse, describeRenderError, isPayloadCompatible } from './render.ts'
import { SYMBOLOGY_KINDS, SYMBOLOGY_META } from './symbology.ts'
import { PAYLOAD_KINDS, PAYLOAD_META } from './payload.ts'

const validResponse = {
  body: '<svg/>',
  content_type: 'image/svg+xml',
  width: 100,
  height: 100,
  description: 'URL: https://example.com',
  warnings: [],
}

describe('render 応答のデコード', () => {
  test('正しい応答を受け付ける', () => {
    const decoded = decodeRenderResponse(validResponse)
    expect(decoded.ok).toBe(true)
  })

  test('必須項目が欠けていれば拒否する', () => {
    for (const missing of ['body', 'content_type', 'width', 'height', 'description', 'warnings']) {
      const broken: Record<string, unknown> = { ...validResponse }
      delete broken[missing]
      expect(decodeRenderResponse(broken).ok).toBe(false)
    }
  })

  test('既知の警告を読む', () => {
    const decoded = decodeRenderResponse({
      ...validResponse,
      warnings: [{ kind: 'low_contrast', ratio: 1.26, minimum: 3 }],
    })
    expect(decoded.ok).toBe(true)
    if (decoded.ok)
      expect(decoded.value.warnings[0]).toEqual({ kind: 'low_contrast', ratio: 1.26, minimum: 3 })
  })

  /** 黙って捨てると、利用者に伝わるはずの警告が消える。 */
  test('未知の警告は握りつぶさず全体をエラーにする', () => {
    const decoded = decodeRenderResponse({ ...validResponse, warnings: [{ kind: 'wat' }] })
    expect(decoded.ok).toBe(false)
  })

  test('オブジェクトでないものを拒否する', () => {
    for (const bad of [null, 'x', 1, []]) {
      expect(decodeRenderResponse(bad).ok).toBe(false)
    }
  })
})

describe('エラー文言', () => {
  test('長すぎるときは次にどうすればよいかを示す', () => {
    const message = describeRenderError({
      kind: 'payload_too_long',
      symbology: 'QR',
      max: 2953,
      actual: 5000,
    })
    expect(message).toContain('5000')
    expect(message).toContain('2953')
    expect(message).toContain('誤り訂正レベル')
  })

  test('すべての種類に文言がある', () => {
    const messages = [
      describeRenderError({ kind: 'payload_too_long', symbology: 'QR', max: 1, actual: 2 }),
      describeRenderError({ kind: 'incompatible_payload', symbology: 'EAN-13', reason: 'x' }),
      describeRenderError({ kind: 'invalid_option', field: 'charset', reason: 'x' }),
    ]
    for (const message of messages) expect(message.length).toBeGreaterThan(10)
  })
})

describe('レジストリ', () => {
  /** Mapped Type なので、union に足してメタを足し忘れると型エラーになる。 */
  test('すべての symbology にメタ情報がある', () => {
    expect(SYMBOLOGY_KINDS.length).toBe(Object.keys(SYMBOLOGY_META).length)
    for (const kind of SYMBOLOGY_KINDS) {
      const meta = SYMBOLOGY_META[kind]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.defaults.kind).toBe(kind)
      expect(meta.quietZone).toBeGreaterThan(0)
    }
  })

  test('すべての payload にメタ情報がある', () => {
    for (const kind of PAYLOAD_KINDS) {
      expect(PAYLOAD_META[kind].label.length).toBeGreaterThan(0)
    }
  })
})

describe('payload と symbology の相性', () => {
  test('QR は何でも載る', () => {
    for (const kind of PAYLOAD_KINDS) expect(isPayloadCompatible(kind, 'qr')).toBe(true)
  })

  test('EAN-13 は数字のテキストだけ', () => {
    expect(isPayloadCompatible('text', 'ean13')).toBe(true)
    expect(isPayloadCompatible('url', 'ean13')).toBe(false)
    expect(isPayloadCompatible('wifi', 'ean13')).toBe(false)
  })

  test('Code128 に Wi-Fi 設定は載せない', () => {
    expect(isPayloadCompatible('wifi', 'code128')).toBe(false)
    expect(isPayloadCompatible('url', 'code128')).toBe(true)
  })
})
