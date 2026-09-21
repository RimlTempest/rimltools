import { describe, expect, test } from 'bun:test'
import { parseNonEmptyText } from '@qrcc/contract'
import { decodeCodePayload, decodeRenderStyle, decodeSymbology } from './spec.ts'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

/**
 * D1 の JSON 1 列から読み戻す部分。**読み出し時に必ずここを通す**
 * （docs/domain-model.md 9 節）。未知の種類は黙って捨てず、失敗にする。
 */
describe('decodeCodePayload', () => {
  test('テキストを読む', () => {
    expect(decodeCodePayload({ kind: 'text', text: 'こんにちは' })).toEqual({
      ok: true,
      value: { kind: 'text', text: 'こんにちは' },
    })
  })

  test('URL は検証してから通す', () => {
    const decoded = decodeCodePayload({ kind: 'url', url: 'https://qrcc.riml4i.com' })
    expect(decoded.ok).toBe(true)
    expect(decodeCodePayload({ kind: 'url', url: 'javascript:alert(1)' }).ok).toBe(false)
  })

  test('Wi-Fi は認証方式ごとに形が違う', () => {
    const decoded = decodeCodePayload({
      kind: 'wifi',
      ssid: 'home',
      auth: { kind: 'wpa', password: 'secret' },
      hidden: true,
    })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok || decoded.value.kind !== 'wifi') throw new Error('wifi payload expected')
    expect(decoded.value.ssid).toBe(expectOk(parseNonEmptyText('home')))
    expect(decoded.value.auth).toEqual({ kind: 'wpa', password: 'secret' })
    expect(decoded.value.hidden).toBe(true)
    expect(
      decodeCodePayload({ kind: 'wifi', ssid: 'home', auth: { kind: 'nope' }, hidden: false }).ok,
    ).toBe(false)
    expect(
      decodeCodePayload({ kind: 'wifi', ssid: '  ', auth: { kind: 'nopass' }, hidden: false }).ok,
    ).toBe(false)
  })

  test('未知の種類は握りつぶさず失敗にする', () => {
    for (const value of [null, 42, {}, { kind: 'payment' }, { kind: 'text' }]) {
      expect(decodeCodePayload(value).ok).toBe(false)
    }
  })
})

describe('decodeSymbology', () => {
  test('種類ごとの設定を読む', () => {
    expect(decodeSymbology({ kind: 'qr', ec: 'H' })).toEqual({
      ok: true,
      value: { kind: 'qr', ec: 'H' },
    })
    expect(decodeSymbology({ kind: 'code128', charset: 'auto' }).ok).toBe(true)
    expect(decodeSymbology({ kind: 'ean13' })).toEqual({ ok: true, value: { kind: 'ean13' } })
  })

  test('仕様にない値は通さない', () => {
    expect(decodeSymbology({ kind: 'qr', ec: 'Z' }).ok).toBe(false)
    expect(decodeSymbology({ kind: 'code128', charset: 'z' }).ok).toBe(false)
    expect(decodeSymbology({ kind: 'maxicode' }).ok).toBe(false)
  })
})

describe('decodeRenderStyle', () => {
  const style = {
    foreground: '#000000',
    background: { kind: 'solid', color: '#ffffff' },
    scale: 6,
    quiet_zone: null,
    module_shape: 'square',
    bar_height: 40,
    human_readable: true,
  }

  test('保存された見た目をそのまま読み戻す', () => {
    const decoded = decodeRenderStyle(style)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(String(decoded.value.foreground)).toBe('#000000')
    expect(decoded.value.background.kind).toBe('solid')
    if (decoded.value.background.kind === 'solid') {
      expect(String(decoded.value.background.color)).toBe('#ffffff')
    }
    expect(decoded.value.scale).toBe(6)
    expect(decoded.value.quiet_zone).toBeNull()
    expect(decoded.value.module_shape).toBe('square')
    expect(decoded.value.bar_height).toBe(40)
    expect(decoded.value.human_readable).toBe(true)
  })

  test('透明背景も表せる', () => {
    expect(decodeRenderStyle({ ...style, background: { kind: 'transparent' } }).ok).toBe(true)
  })

  test('色が壊れていたら失敗にする', () => {
    expect(decodeRenderStyle({ ...style, foreground: 'black' }).ok).toBe(false)
    expect(decodeRenderStyle({ ...style, background: { kind: 'solid', color: 'white' } }).ok).toBe(
      false,
    )
  })

  test('欠けている項目があれば失敗にする', () => {
    expect(decodeRenderStyle({ ...style, scale: undefined }).ok).toBe(false)
    expect(decodeRenderStyle({ ...style, module_shape: 'hexagon' }).ok).toBe(false)
  })
})
