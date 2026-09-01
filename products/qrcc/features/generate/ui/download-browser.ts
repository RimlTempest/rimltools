/**
 * `CanvasDeps` のブラウザ実装。
 *
 * DOM を触るのはここだけ。本物の型をそのまま使えるので型アサーションが要らず、
 * 実際に描けているかは e2e（実ブラウザ）が確かめる。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { CanvasDeps, DownloadError, PixelSize } from './download.ts'

/** HTML in Canvas。2026 年時点では Chrome Canary などのフラグ付き。 */
type ElementDrawingContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Result<Blob, DownloadError>> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(
        blob === null
          ? err({ kind: 'encode_failed', detail: 'the canvas produced no image' })
          : ok(blob),
      )
    }, 'image/png')
  })

const prepareCanvas = (size: PixelSize) => {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  return canvas
}

const drawingContext = (canvas: HTMLCanvasElement): ElementDrawingContext | null =>
  canvas.getContext('2d')

/** 実ブラウザで `drawElementImage` が使えるか。 */
export const supportsElementCapture = (): boolean => {
  if (typeof document === 'undefined') return false
  const context = drawingContext(document.createElement('canvas'))
  return context !== null && typeof context.drawElementImage === 'function'
}

export const browserCanvasDeps = (): CanvasDeps => ({
  rasterizeUrl: async (sourceUrl, size) => {
    const image = new Image()
    const loaded = await new Promise<boolean>((resolve) => {
      image.addEventListener('load', () => resolve(true), { once: true })
      image.addEventListener('error', () => resolve(false), { once: true })
      image.src = sourceUrl
    })
    if (!loaded) {
      return err({ kind: 'decode_failed', detail: 'the generated SVG could not be decoded' })
    }

    const canvas = prepareCanvas(size)
    const context = drawingContext(canvas)
    if (context === null) {
      return err({ kind: 'unsupported', detail: '2d canvas context is unavailable' })
    }
    context.drawImage(image, 0, 0, size.width, size.height)
    return toBlob(canvas)
  },

  rasterizeElement: async (element, size) => {
    if (!(element instanceof Element)) {
      return err({ kind: 'unsupported', detail: 'no element to capture' })
    }
    const canvas = prepareCanvas(size)
    const context = drawingContext(canvas)
    if (context === null || typeof context.drawElementImage !== 'function') {
      return err({ kind: 'unsupported', detail: 'drawElementImage is not available' })
    }
    context.drawElementImage(element, 0, 0)
    return toBlob(canvas)
  },

  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => {
    URL.revokeObjectURL(url)
  },
})

/** Blob を名前付きで保存する。 */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
