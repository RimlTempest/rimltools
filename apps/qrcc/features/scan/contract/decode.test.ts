import { describe, expect, test } from 'bun:test'
import {
  DETECTABLE_FORMATS,
  SCAN_SYMBOLOGY_KINDS,
  SCAN_SYMBOLOGY_META,
  decodeScanError,
  decodeScanResponse,
  describeScanFailure,
  fromBarcodeDetectorFormat,
} from './index.ts'

const detection = {
  text: 'https://qrcc.riml4i.com',
  symbology: 'qr',
  corners: [{ x: 1, y: 2 }],
}

describe('読み取り結果のデコード', () => {
  test('正しい結果を受け付ける', () => {
    const decoded = decodeScanResponse({ detections: [detection] })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.detections[0]?.text).toBe('https://qrcc.riml4i.com')
      expect(decoded.value.detections[0]?.symbology).toBe('qr')
      expect(decoded.value.detections[0]?.corners).toEqual([{ x: 1, y: 2 }])
    }
  })

  test('位置が無くても受け付ける（読み取り器が返さないことがある）', () => {
    const decoded = decodeScanResponse({ detections: [{ text: 'x', symbology: 'ean13' }] })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value.detections[0]?.corners).toEqual([])
  })

  test('必須項目が欠けていれば拒否する', () => {
    expect(decodeScanResponse({ detections: [{ symbology: 'qr' }] }).ok).toBe(false)
    expect(decodeScanResponse({ detections: [{ text: 'x' }] }).ok).toBe(false)
    expect(decodeScanResponse({}).ok).toBe(false)
  })

  /** 黙って捨てると、読めたはずのコードが画面から消える。 */
  test('未知の symbology は握りつぶさず全体をエラーにする', () => {
    expect(decodeScanResponse({ detections: [{ text: 'x', symbology: 'wat' }] }).ok).toBe(false)
  })

  test('オブジェクトでないものを拒否する', () => {
    for (const bad of [null, 'x', 1, []]) expect(decodeScanResponse(bad).ok).toBe(false)
  })

  test('壊れた位置情報を拒否する', () => {
    expect(decodeScanResponse({ detections: [{ ...detection, corners: [{ x: 1 }] }] }).ok).toBe(
      false,
    )
  })
})

describe('読み取りエラーのデコード', () => {
  test('既知のエラーを読む', () => {
    const decoded = decodeScanError({ kind: 'image_too_large', width: 5000, height: 10, max: 4096 })
    expect(decoded.ok).toBe(true)
    if (decoded.ok && decoded.value.kind === 'image_too_large') {
      expect(decoded.value.width).toBe(5000)
      expect(decoded.value.max).toBe(4096)
    }
  })

  test('引数を持たないエラーも読む', () => {
    expect(decodeScanError({ kind: 'not_found' }).ok).toBe(true)
    expect(decodeScanError({ kind: 'unsupported_symbology' }).ok).toBe(true)
  })

  test('必須項目が欠けていれば拒否する', () => {
    expect(decodeScanError({ kind: 'unsupported_image' }).ok).toBe(false)
    expect(decodeScanError({ kind: 'image_too_large', width: 1 }).ok).toBe(false)
    expect(decodeScanError({ kind: 'unreadable' }).ok).toBe(false)
  })

  /** 画面に出ないまま消えるのを防ぐ。 */
  test('未知の kind は握りつぶさない', () => {
    expect(decodeScanError({ kind: 'wat' }).ok).toBe(false)
    expect(decodeScanError(null).ok).toBe(false)
    expect(decodeScanError({}).ok).toBe(false)
  })
})

describe('エラー文言', () => {
  test('大きすぎる画像は上限と実寸を示す', () => {
    const message = describeScanFailure({
      kind: 'image_too_large',
      width: 5000,
      height: 10,
      max: 4096,
    })
    expect(message).toContain('5000')
    expect(message).toContain('4096')
  })

  test('カメラを拒否されたときは代替手段を案内する', () => {
    expect(describeScanFailure({ kind: 'permission_denied' })).toContain('画像')
  })

  test('すべての種類に、次にどうすればよいかが書いてある', () => {
    const messages = [
      describeScanFailure({ kind: 'not_found' }),
      describeScanFailure({ kind: 'unreadable', detail: 'checksum' }),
      describeScanFailure({ kind: 'unsupported_image', detail: 'bad' }),
      describeScanFailure({ kind: 'unsupported_symbology' }),
      describeScanFailure({ kind: 'image_too_large', width: 1, height: 1, max: 4096 }),
      describeScanFailure({ kind: 'permission_denied' }),
      describeScanFailure({ kind: 'no_camera' }),
      describeScanFailure({ kind: 'camera_unavailable', detail: 'x' }),
      describeScanFailure({ kind: 'decoder_unavailable', detail: 'x' }),
    ]
    for (const message of messages) expect(message.length).toBeGreaterThan(10)
  })
})

describe('レジストリ', () => {
  /** Mapped Type なので、union に足してメタを足し忘れると型エラーになる。 */
  test('すべての symbology にメタ情報がある', () => {
    expect(SCAN_SYMBOLOGY_KINDS.length).toBe(Object.keys(SCAN_SYMBOLOGY_META).length)
    for (const kind of SCAN_SYMBOLOGY_KINDS) {
      expect(SCAN_SYMBOLOGY_META[kind].label.length).toBeGreaterThan(0)
    }
  })

  test('Rust と同じ 21 種類を知っている', () => {
    expect(SCAN_SYMBOLOGY_KINDS.length).toBe(21)
    expect(SCAN_SYMBOLOGY_KINDS).toContain('qr')
    expect(SCAN_SYMBOLOGY_KINDS).toContain('code128')
    expect(SCAN_SYMBOLOGY_KINDS).toContain('ean13')
  })

  test('BarcodeDetector に頼める形式は往復する', () => {
    expect(DETECTABLE_FORMATS.length).toBeGreaterThan(0)
    for (const format of DETECTABLE_FORMATS) {
      const kind = fromBarcodeDetectorFormat(format)
      expect(kind).toBeDefined()
      if (kind !== undefined) expect(SCAN_SYMBOLOGY_META[kind].detectorFormat === format).toBe(true)
    }
  })

  test('BarcodeDetector が知らない形式は読み替えない', () => {
    expect(fromBarcodeDetectorFormat('unknown')).toBeUndefined()
    expect(fromBarcodeDetectorFormat('telepen')).toBeUndefined()
  })
})
