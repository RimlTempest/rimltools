/**
 * `decode` メソッドの要求と応答（docs/api-contract.md）。
 *
 * Rust 側の定義は `features/scan/engine/src/decode.rs`。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { ScanSymbology } from './symbology.ts'
import { isScanSymbology } from './symbology.ts'

/** 1 辺の上限（画素）。Rust 側の `MAX_IMAGE_DIMENSION` と同じ値。 */
export const MAX_IMAGE_DIMENSION = 4096

/** 何を、どれくらい念入りに探すか。 */
export type DecodeHints = {
  /** 探す体系。空ならすべて。 */
  readonly symbologies: readonly ScanSymbology[]
  readonly multiple: boolean
  /** 時間をかけて精度を上げる。カメラの連写では false、画像 1 枚では true。 */
  readonly try_harder: boolean
}

/** 検出位置（画素）。読み取り器が返さないこともあるので空でありうる。 */
export type Corner = { readonly x: number; readonly y: number }

export type Detection = {
  readonly text: string
  readonly symbology: ScanSymbology
  readonly corners: readonly Corner[]
}

export type DecodeResponse = {
  readonly detections: readonly Detection[]
}

/** エンジンが返す失敗。 */
export type DecodeError =
  | { readonly kind: 'unsupported_image'; readonly detail: string }
  | {
      readonly kind: 'image_too_large'
      readonly width: number
      readonly height: number
      readonly max: number
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unreadable'; readonly detail: string }
  | { readonly kind: 'unsupported_symbology' }

/** カメラを使おうとして起きる失敗。エンジンではなくブラウザ側の事情。 */
export type CameraError =
  | { readonly kind: 'permission_denied' }
  | { readonly kind: 'no_camera' }
  | { readonly kind: 'camera_unavailable'; readonly detail: string }

/** 画面が扱う失敗の全体。読み上げ文言はこの union だけを見て決まる。 */
export type ScanFailure =
  | DecodeError
  | CameraError
  | { readonly kind: 'decoder_unavailable'; readonly detail: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (source: Record<string, unknown>, key: string): string | undefined =>
  typeof source[key] === 'string' ? source[key] : undefined

const readNumber = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : undefined

const decodeCorner = (value: unknown): Corner | undefined => {
  if (!isRecord(value)) return undefined
  const x = readNumber(value, 'x')
  const y = readNumber(value, 'y')
  return x === undefined || y === undefined ? undefined : { x, y }
}

const decodeCorners = (value: unknown): Result<readonly Corner[], { readonly detail: string }> => {
  if (value === undefined || value === null) return ok([])
  if (!Array.isArray(value)) return err({ detail: 'corners must be an array' })
  const corners: Corner[] = []
  for (const raw of value) {
    const corner = decodeCorner(raw)
    if (corner === undefined) return err({ detail: `unreadable corner: ${JSON.stringify(raw)}` })
    corners.push(corner)
  }
  return ok(corners)
}

const decodeDetection = (value: unknown): Result<Detection, { readonly detail: string }> => {
  if (!isRecord(value)) return err({ detail: 'detection must be an object' })
  const text = readString(value, 'text')
  if (text === undefined) return err({ detail: 'detection is missing text' })

  const symbology = value['symbology']
  if (!isScanSymbology(symbology)) {
    return err({ detail: `unknown symbology: ${JSON.stringify(symbology)}` })
  }

  const corners = decodeCorners(value['corners'])
  return corners.ok ? ok({ text, symbology, corners: corners.value }) : corners
}

/**
 * エンジンの応答を検証する。
 * 未知の symbology は黙って捨てず、全体をエラーにする（読めたはずのコードが
 * 画面から消えるのを防ぐ）。
 */
export const decodeScanResponse = (
  value: unknown,
): Result<DecodeResponse, { readonly detail: string }> => {
  if (!isRecord(value)) return err({ detail: 'decode response must be an object' })
  const raw = value['detections']
  if (!Array.isArray(raw)) return err({ detail: 'decode response is missing detections' })

  const detections: Detection[] = []
  for (const entry of raw) {
    const detection = decodeDetection(entry)
    if (!detection.ok) return detection
    detections.push(detection.value)
  }
  return ok({ detections })
}

/**
 * エンジンが返したエラーを読む。
 * 未知の `kind` は握りつぶさず失敗にする（画面に出ないまま消えるのを防ぐ）。
 */
export const decodeScanError = (
  value: unknown,
): Result<DecodeError, { readonly detail: string }> => {
  if (!isRecord(value)) return err({ detail: 'decode error must be an object' })
  const kind = readString(value, 'kind')

  if (kind === 'not_found' || kind === 'unsupported_symbology') return ok({ kind })
  if (kind === 'unsupported_image' || kind === 'unreadable') {
    const detail = readString(value, 'detail')
    return detail === undefined ? err({ detail: `${kind} requires detail` }) : ok({ kind, detail })
  }
  if (kind === 'image_too_large') {
    const width = readNumber(value, 'width')
    const height = readNumber(value, 'height')
    const max = readNumber(value, 'max')
    return width === undefined || height === undefined || max === undefined
      ? err({ detail: 'image_too_large requires width, height and max' })
      : ok({ kind, width, height, max })
  }
  return err({ detail: `unknown decode error kind: ${String(kind)}` })
}

/**
 * 画面に出す文言。失敗の種類ごとに「次にどうすればよいか」まで書く。
 * 読み上げ領域にそのまま載るので、原因だけを述べて終わらない。
 */
export const describeScanFailure = (failure: ScanFailure): string => {
  switch (failure.kind) {
    case 'not_found':
      return 'コードが見つかりませんでした。コード全体が写るようにして、もう一度お試しください。'
    case 'unreadable':
      return `コードは見つかりましたが読み取れませんでした（${failure.detail}）。汚れや反射を避けて、もう一度お試しください。`
    case 'unsupported_image':
      return '画像として読めませんでした。PNG・JPEG・WebP のいずれかを選んでください。'
    case 'image_too_large':
      return `画像が大きすぎます（${failure.width} × ${failure.height} ピクセル）。1 辺 ${failure.max} ピクセル以内に縮小してください。`
    case 'unsupported_symbology':
      return 'この形式のコードには対応していません。'
    case 'permission_denied':
      return 'カメラの使用が許可されませんでした。ブラウザの設定で許可するか、下の「画像から読み取る」をお使いください。'
    case 'no_camera':
      return 'カメラが見つかりませんでした。下の「画像から読み取る」をお使いください。'
    case 'camera_unavailable':
      return `カメラを起動できませんでした（${failure.detail}）。下の「画像から読み取る」をお使いください。`
    case 'decoder_unavailable':
      return `読み取り機能を読み込めませんでした（${failure.detail}）。通信状況を確かめて、ページを再読み込みしてください。`
  }
}
