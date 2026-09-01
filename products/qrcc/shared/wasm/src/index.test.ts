import { describe, expect, test } from 'bun:test'
import { ok } from '@qrcc/contract'
import type { WasmDecoderModule, WasmModule } from './index.ts'
import { makeWasmDecoder, makeWasmRenderer } from './index.ts'

const anyValue = (value: unknown) => ok(value)

const envelope = (body: unknown) => JSON.stringify(body)

const moduleReturning = (response: string): WasmModule => ({ render: () => response })

describe('wasm レンダラ', () => {
  test('成功した封筒の中身を返す', async () => {
    const renderer = makeWasmRenderer(async () =>
      moduleReturning(envelope({ ok: true, value: { body: '<svg/>' } })),
    )
    const result = await renderer.render({}, anyValue, anyValue)
    expect(result).toEqual({ ok: true, value: { ok: true, value: { body: '<svg/>' } } })
  })

  test('エンジンのエラーは内側の Result になる', async () => {
    const renderer = makeWasmRenderer(async () =>
      moduleReturning(envelope({ ok: false, error: { kind: 'payload_too_long' } })),
    )
    const result = await renderer.render({}, anyValue, anyValue)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ ok: false, error: { kind: 'payload_too_long' } })
  })

  test('読み込みに失敗しても例外を投げず値で返す', async () => {
    const renderer = makeWasmRenderer(() => Promise.reject(new Error('offline')))
    const result = await renderer.render({}, anyValue, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('wasm_unavailable')
      if (result.error.kind === 'wasm_unavailable') expect(result.error.detail).toContain('offline')
    }
  })

  test('壊れた封筒は転送エラーにする', async () => {
    const renderer = makeWasmRenderer(async () => moduleReturning('not json'))
    const result = await renderer.render({}, anyValue, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('malformed_envelope')
  })

  /** 200KB 超の wasm を毎回取りに行かせない。 */
  test('wasm の読み込みは 1 度だけ', async () => {
    let loads = 0
    const renderer = makeWasmRenderer(async () => {
      loads += 1
      return moduleReturning(envelope({ ok: true, value: null }))
    })
    await renderer.render({}, anyValue, anyValue)
    await renderer.render({}, anyValue, anyValue)
    expect(loads).toBe(1)
  })

  /** 一時的な不調で永久に諦めると、再読み込みでしか復帰できなくなる。 */
  test('読み込みに失敗したら次の呼び出しで再試行する', async () => {
    let attempts = 0
    const renderer = makeWasmRenderer(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('flaky')
      return moduleReturning(envelope({ ok: true, value: null }))
    })
    const first = await renderer.render({}, anyValue, anyValue)
    expect(first.ok).toBe(false)
    const second = await renderer.render({}, anyValue, anyValue)
    expect(second.ok).toBe(true)
    expect(attempts).toBe(2)
  })
})

const decoderReturning = (response: string): WasmDecoderModule => ({ decode: () => response })

describe('wasm デコーダ', () => {
  test('検出結果を封筒の中から返す', async () => {
    const decoder = makeWasmDecoder(async () =>
      decoderReturning(envelope({ ok: true, value: { detections: [] } })),
    )
    const result = await decoder.decode(new Uint8Array([1]), {}, anyValue, anyValue)
    expect(result).toEqual({ ok: true, value: { ok: true, value: { detections: [] } } })
  })

  test('エンジンのエラーは内側の Result になる', async () => {
    const decoder = makeWasmDecoder(async () =>
      decoderReturning(envelope({ ok: false, error: { kind: 'not_found' } })),
    )
    const result = await decoder.decode(new Uint8Array(), {}, anyValue, anyValue)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ ok: false, error: { kind: 'not_found' } })
  })

  test('読み込みに失敗しても例外を投げず値で返す', async () => {
    const decoder = makeWasmDecoder(() => Promise.reject(new Error('offline')))
    const result = await decoder.decode(new Uint8Array(), {}, anyValue, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('wasm_unavailable')
  })

  /** 画像とヒントがそのまま wasm に渡ること（サーバには送らない）。 */
  test('画像バイト列とヒントの JSON を渡す', async () => {
    const calls: { image: Uint8Array; hints: string }[] = []
    const decoder = makeWasmDecoder(async () => ({
      decode: (image, hints) => {
        calls.push({ image, hints })
        return envelope({ ok: true, value: { detections: [] } })
      },
    }))
    const bytes = new Uint8Array([137, 80, 78, 71])
    await decoder.decode(bytes, { multiple: true }, anyValue, anyValue)
    expect(calls[0]?.image).toBe(bytes)
    expect(calls[0]?.hints).toBe('{"multiple":true}')
  })

  /** 800KB 近い wasm を毎コマ取りに行かせない。 */
  test('wasm の読み込みは 1 度だけ', async () => {
    let loads = 0
    const decoder = makeWasmDecoder(async () => {
      loads += 1
      return decoderReturning(envelope({ ok: true, value: null }))
    })
    await decoder.decode(new Uint8Array(), {}, anyValue, anyValue)
    await decoder.decode(new Uint8Array(), {}, anyValue, anyValue)
    expect(loads).toBe(1)
  })
})
