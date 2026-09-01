/**
 * TS が組み立てる `RenderRequest` の JSON が、Rust が読む形と一致することを
 * `features/generate/fixtures/render-cases.json` で確かめる。
 *
 * Rust 側の対になるテストは `features/generate/engine/tests/conformance.rs`
 * （そちらは同じ JSON を実際に生成にかける）。片方の形だけ変えると必ず落ちる。
 */
import { describe, expect, test } from 'bun:test'
import { parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type { RenderRequest } from './render.ts'

import fixture from '../fixtures/render-cases.json' with { type: 'json' }

const color = (value: string) => {
  const parsed = parseHexColor(value)
  if (!parsed.ok) throw new Error(`fixture colour is invalid: ${value}`)
  return parsed.value
}

const caseNamed = (name: string) => {
  const found = fixture.cases.find((entry) => entry.name === name)
  if (found === undefined) throw new Error(`missing fixture case: ${name}`)
  return found
}

describe('render 要求のワイヤ形式', () => {
  test('URL + QR の要求が Rust の読む形と一致する', () => {
    const url = parseHttpUrl('https://qrcc.riml4i.com')
    expect(url.ok).toBe(true)
    if (!url.ok) return

    const request: RenderRequest = {
      payload: { kind: 'url', url: url.value },
      symbology: { kind: 'qr', ec: 'M' },
      style: {
        foreground: color('#000000'),
        background: { kind: 'solid', color: color('#ffffff') },
        scale: 4,
        quiet_zone: null,
        module_shape: 'square',
        bar_height: 40,
        human_readable: true,
      },
      output: 'svg',
    }

    expect(JSON.parse(JSON.stringify(request))).toEqual(caseNamed('qr-url-default').request)
  })

  test('Wi-Fi + QR の要求が Rust の読む形と一致する', () => {
    const ssid = parseNonEmptyText('home')
    expect(ssid.ok).toBe(true)
    if (!ssid.ok) return

    const request: RenderRequest = {
      payload: {
        kind: 'wifi',
        ssid: ssid.value,
        auth: { kind: 'wpa', password: 'secret' },
        hidden: false,
      },
      symbology: { kind: 'qr', ec: 'H' },
      style: {
        foreground: color('#777777'),
        background: { kind: 'solid', color: color('#888888') },
        scale: 2,
        quiet_zone: 2,
        module_shape: 'dot',
        bar_height: 40,
        human_readable: false,
      },
      output: 'svg',
    }

    expect(JSON.parse(JSON.stringify(request))).toEqual(caseNamed('qr-wifi-low-contrast').request)
  })

  test('透明背景の要求も同じ形になる', () => {
    const style: RenderRequest['style'] = {
      foreground: color('#000000'),
      background: { kind: 'transparent' },
      scale: 3,
      quiet_zone: null,
      module_shape: 'square',
      bar_height: 40,
      human_readable: true,
    }
    expect(JSON.parse(JSON.stringify(style))).toEqual(
      caseNamed('ean13-invalid-digits').request.style,
    )
  })

  test('フィクスチャのすべてのケースに名前と期待結果がある', () => {
    for (const entry of fixture.cases) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(typeof entry.expect.ok).toBe('boolean')
    }
  })
})
