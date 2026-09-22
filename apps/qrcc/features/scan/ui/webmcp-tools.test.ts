import { describe, expect, test } from 'bun:test'
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { DecodeResponse, ScanFailure } from '../contract/index.ts'
import { makeDecodeTool } from './webmcp-tools.ts'

type DecodeBytes = (bytes: Uint8Array) => Promise<Result<DecodeResponse, ScanFailure>>

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`

const stubDecoder = (
  response: Result<DecodeResponse, ScanFailure>,
): { decodeBytes: DecodeBytes; calls: Uint8Array[] } => {
  const calls: Uint8Array[] = []
  const decodeBytes: DecodeBytes = (bytes) => {
    calls.push(bytes)
    return Promise.resolve(response)
  }
  return { decodeBytes, calls }
}

describe('makeDecodeTool', () => {
  test('name が decode-code-image', () => {
    const { decodeBytes } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    expect(tool.name).toBe('decode-code-image')
  })

  test('data: 以外の URL は decodeBytes を呼ばず拒否理由を返す', async () => {
    const { decodeBytes, calls } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: 'https://example.com/secret-internal-api' })
    expect(calls).toHaveLength(0)
    expect(result.content[0]?.text.length).toBeGreaterThan(0)
  })

  test('base64 が壊れた data: URL は例外を投げず理由を返す', async () => {
    const { decodeBytes, calls } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: 'data:image/png;base64,!!!not-valid-base64!!!' })
    expect(calls).toHaveLength(0)
    expect(result.content[0]?.text.length).toBeGreaterThan(0)
  })

  test('上限（4MB）を超えるバイト列は decodeBytes を呼ばず拒否する', async () => {
    const { decodeBytes, calls } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    const huge = Buffer.alloc(4 * 1024 * 1024 + 1, 1).toString('base64')
    const result = await tool.execute({ image: `data:image/png;base64,${huge}` })
    expect(calls).toHaveLength(0)
    expect(result.content[0]?.text.length).toBeGreaterThan(0)
  })

  test('正常な data: URL で decodeBytes が 1 回呼ばれる', async () => {
    const { decodeBytes, calls } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    await tool.execute({ image: PNG_DATA_URL })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(PNG_BYTES)
  })

  test('検出結果が 0 件のとき見つからなかった旨を返す', async () => {
    const { decodeBytes } = stubDecoder(ok({ detections: [] }))
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: PNG_DATA_URL })
    expect(result.content[0]?.text).toContain('見つかりませんでした')
  })

  test('検出結果が複数のとき、全部の text と symbology が本文に入る', async () => {
    const { decodeBytes } = stubDecoder(
      ok({
        detections: [
          { text: 'https://example.com', symbology: 'qr', corners: [] },
          { text: '4912345678904', symbology: 'ean13', corners: [] },
        ],
      }),
    )
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: PNG_DATA_URL })
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('https://example.com')
    expect(text).toContain('qr')
    expect(text).toContain('4912345678904')
    expect(text).toContain('ean13')
  })

  test('decodeBytes が失敗を返したとき describeScanFailure の文言を返す', async () => {
    const { decodeBytes } = stubDecoder(err({ kind: 'not_found' }))
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: PNG_DATA_URL })
    expect(result.content[0]?.text).toContain('見つかりませんでした')
  })

  test('解釈結果と生テキストの両方が本文に入る', async () => {
    const wifiText = 'WIFI:S:MyNet;T:WPA;P:secret;;'
    const { decodeBytes } = stubDecoder(
      ok({ detections: [{ text: wifiText, symbology: 'qr', corners: [] }] }),
    )
    const tool = makeDecodeTool(decodeBytes)
    const result = await tool.execute({ image: PNG_DATA_URL })
    const text = result.content[0]?.text ?? ''
    // 生テキストがそのまま残っている
    expect(text).toContain(wifiText)
    // interpret() の構造化結果（SSID・認証方式）も入っている
    expect(text).toContain('MyNet')
    expect(text).toContain('WPA')
  })
})
