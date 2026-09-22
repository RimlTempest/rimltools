/**
 * 読み取りのブラウザ実装。
 *
 * **DOM とカメラを触るのはここだけ。** 画面（`scan-screen.tsx`）は
 * この形の関数を引数で受け取るので、テストでは偽物を渡せる。
 * ここが本当に動くことは e2e（実ブラウザ）が確かめる。
 *
 * 読み取りはすべて端末の中で完結する。画像もカメラの映像もサーバに送らない。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import { loadBrowserDecoder, makeWasmDecoder } from '@qrcc/wasm'
import type {
  CameraError,
  DecodeHints,
  DecodeResponse,
  Detection,
  ScanFailure,
} from '../contract/index.ts'
import {
  DETECTABLE_FORMATS,
  decodeScanError,
  decodeScanResponse,
  fromBarcodeDetectorFormat,
} from '../contract/index.ts'
import type { CopyText, DecodeImageFile, ScanSession, StartCamera } from './scan-screen.tsx'

/** カメラの 1 コマを読む間隔（ms）。短くしても手ぶれで精度は上がらない。 */
const FRAME_INTERVAL_MS = 400
/** 解析に使う 1 コマの最大幅（px）。大きくしても読み取り率は上がらず、時間だけ延びる。 */
const FRAME_MAX_WIDTH = 720

const decoder = makeWasmDecoder(loadBrowserDecoder)

const fileHints: DecodeHints = { symbologies: [], multiple: true, try_harder: true }
/** カメラは 1 コマあたりの時間が命なので、念入りには探さない。 */
const frameHints: DecodeHints = { symbologies: [], multiple: false, try_harder: false }

const decodeBytes = async (
  bytes: Uint8Array,
  hints: DecodeHints,
): Promise<Result<DecodeResponse, ScanFailure>> => {
  const outcome = await decoder.decode(bytes, hints, decodeScanResponse, decodeScanError)
  return outcome.ok
    ? outcome.value
    : err({ kind: 'decoder_unavailable', detail: outcome.error.detail })
}

/**
 * 画像ファイルからの読み取り。
 * ファイルはそのままバイト列にして wasm に渡す（**サーバには送らない**）。
 */
export const browserImageDecoder = (): DecodeImageFile => async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return decodeBytes(bytes, fileHints)
}

/** この環境でカメラを使えるか。SSR とハイドレーション前は使えない。 */
export const canUseCamera = (): boolean =>
  typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined

/** クリップボードに書けるか。安全でないコンテキストでは使えない。 */
export const canCopyText = (): boolean =>
  typeof navigator !== 'undefined' && navigator.clipboard !== undefined

export const browserCopyText: CopyText = async (text) => {
  if (!canCopyText()) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * `getUserMedia` の失敗を、画面が案内を出し分けられる形に翻訳する。
 * 「拒否された」と「カメラが無い」では、次にすべきことが違う。
 */
const cameraFailure = (cause: unknown): CameraError => {
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'permission_denied' }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { kind: 'no_camera' }
  return {
    kind: 'camera_unavailable',
    detail: cause instanceof Error ? cause.message : String(cause),
  }
}

/** 1 コマから検出結果を取り出す方法。組み込み API と wasm で同じ形にする。 */
type FrameReader = (video: HTMLVideoElement) => Promise<readonly Detection[]>

/**
 * Barcode Detection API。Baseline ではない（2026 年時点で Chrome / Android と
 * 一部の環境だけ）ので、型を自分で書き、実行時に存在を確かめてから使う。
 */
type BarcodeDetectorResult = {
  readonly rawValue: string
  readonly format: string
  readonly cornerPoints?: readonly { readonly x: number; readonly y: number }[]
}

type BarcodeDetectorLike = {
  readonly detect: (source: CanvasImageSource) => Promise<readonly BarcodeDetectorResult[]>
}

type BarcodeDetectorConstructor = new (options?: {
  readonly formats?: readonly string[]
}) => BarcodeDetectorLike

const nativeReader = (): FrameReader | undefined => {
  // 標準の型定義に無いグローバルなので Reflect で取り出し、形は typeof で確かめる
  const candidate: BarcodeDetectorConstructor | undefined = Reflect.get(
    globalThis,
    'BarcodeDetector',
  )
  if (typeof candidate !== 'function') return undefined

  let detector: BarcodeDetectorLike
  try {
    detector = new candidate({ formats: DETECTABLE_FORMATS })
  } catch {
    // 対応形式の指定を受け付けない実装がある。そのときは wasm に落とす
    return undefined
  }

  return async (video) => {
    const results = await detector.detect(video)
    const detections: Detection[] = []
    for (const result of results) {
      const symbology = fromBarcodeDetectorFormat(result.format)
      // 知らない形式名を勝手に読み替えない（誤った種類を表示しないため）
      if (symbology === undefined) continue
      detections.push({
        text: result.rawValue,
        symbology,
        corners: (result.cornerPoints ?? []).map((point) => ({ x: point.x, y: point.y })),
      })
    }
    return detections
  }
}

const frameToPng = async (video: HTMLVideoElement): Promise<Uint8Array | undefined> => {
  const source = { width: video.videoWidth, height: video.videoHeight }
  if (source.width === 0 || source.height === 0) return undefined

  const ratio = Math.min(1, FRAME_MAX_WIDTH / source.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * ratio)
  canvas.height = Math.round(source.height * ratio)
  const context = canvas.getContext('2d')
  if (context === null) return undefined
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (blob === null) return undefined
  return new Uint8Array(await blob.arrayBuffer())
}

/** 組み込み API が無いときの経路。1 コマを PNG にして wasm に渡す。 */
const wasmReader: FrameReader = async (video) => {
  const png = await frameToPng(video)
  if (png === undefined) return []
  const outcome = await decodeBytes(png, frameHints)
  // 1 コマ読めないのは普通のこと。画面には出さない
  return outcome.ok ? outcome.value.detections : []
}

const stopTracks = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop()
}

/**
 * カメラを起動して読み取り続ける。
 *
 * 組み込みの `BarcodeDetector` があればそれを使い、無ければ wasm に落とす
 * （iOS Safari など）。どちらでも画面から見た形は同じ。
 */
export const browserCamera =
  (): StartCamera =>
  async ({ video, onDetect, onFail }) => {
    if (video === null) {
      return err({ kind: 'camera_unavailable', detail: 'no video element is mounted' })
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // 背面カメラを優先する。手元のコードを写すのが目的なので
        video: { facingMode: 'environment' },
        audio: false,
      })
    } catch (cause) {
      return err(cameraFailure(cause))
    }

    video.srcObject = stream
    // React の muted 属性はプロパティに反映されないことがある。自動再生の条件なので明示する
    video.muted = true
    try {
      await video.play()
    } catch (cause) {
      stopTracks(stream)
      return err(cameraFailure(cause))
    }

    const read = nativeReader() ?? wasmReader
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const session: ScanSession = {
      stop: () => {
        if (stopped) return
        stopped = true
        if (timer !== undefined) clearTimeout(timer)
        video.srcObject = null
        stopTracks(stream)
      },
    }

    const tick = async () => {
      if (stopped) return
      try {
        for (const detection of await read(video)) {
          if (!stopped) onDetect(detection)
        }
      } catch (cause) {
        // 読み取り機ごと壊れた場合。映像を止めてから通知する
        session.stop()
        onFail(cameraFailure(cause))
        return
      }
      if (!stopped) {
        timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS)
      }
    }

    timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS)
    return ok(session)
  }
