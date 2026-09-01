/**
 * 生成したコードの保存。
 *
 * ブラウザ機能は「オブジェクトの形」ではなく**能力**として引数で受け取る。
 * DOM の型をそのまま注入しようとすると、テスト用の偽物を作るのに型アサーションが
 * 要る（`as` は禁止）。ラスタ化のような 1 つの操作を丸ごと差し替える形にすれば、
 * 実装側は本物の DOM 型を素直に使え、テスト側は素の関数を渡すだけで済む。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'

export type PixelSize = { readonly width: number; readonly height: number }

export type DownloadError =
  | { readonly kind: 'decode_failed'; readonly detail: string }
  | { readonly kind: 'encode_failed'; readonly detail: string }
  | { readonly kind: 'unsupported'; readonly detail: string }

export type CanvasDeps = {
  /** 画像 URL を、指定サイズのラスタ画像にする。 */
  readonly rasterizeUrl: (
    sourceUrl: string,
    size: PixelSize,
  ) => Promise<Result<Blob, DownloadError>>
  /** DOM 要素をまるごとラスタ画像にする（HTML in Canvas）。使えない環境では unsupported。 */
  readonly rasterizeElement: (
    element: unknown,
    size: PixelSize,
  ) => Promise<Result<Blob, DownloadError>>
  readonly createObjectUrl: (blob: Blob) => string
  readonly revokeObjectUrl: (url: string) => void
}

/** 保存するときのファイル名。内容から作るので、複数保存しても見分けが付く。 */
export const buildFileName = (description: string, extension: string): string => {
  const base = description
    // ファイル名に使えない文字と、パス区切りに見える文字を落とす
    .replaceAll(/[\\/:*?"<>|]/g, '')
    .replaceAll(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base.length === 0 ? 'qrcc-code' : base}.${extension}`
}

export const svgToBlob = (svg: string): Blob =>
  new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })

/**
 * SVG を PNG にする。
 *
 * Rust 側にラスタライザを持ち込むと wasm が太るので、ブラウザに任せる
 * （ADR-0003 のサイズ目標を守るため）。
 */
export const svgToPng = async (
  svg: string,
  size: PixelSize,
  deps: CanvasDeps,
): Promise<Result<Blob, DownloadError>> => {
  const sourceUrl = deps.createObjectUrl(svgToBlob(svg))
  try {
    return await deps.rasterizeUrl(sourceUrl, size)
  } finally {
    // 解放しないと、生成のたびにメモリが積み上がる
    deps.revokeObjectUrl(sourceUrl)
  }
}

/**
 * コードと説明文を含む要素をまるごと 1 枚の PNG にする。
 *
 * HTML in Canvas（`drawElementImage`）が使えるときだけ成功する。
 * フォントや合字、右書きの扱いをブラウザ本体に任せられるので、
 * 画面の再実装より結果が正確になる。
 */
export const elementToPng = (
  element: unknown,
  size: PixelSize,
  deps: CanvasDeps,
): Promise<Result<Blob, DownloadError>> => deps.rasterizeElement(element, size)

export const unsupported = (detail: string): Result<Blob, DownloadError> =>
  err({ kind: 'unsupported', detail })

export const encoded = (blob: Blob): Result<Blob, DownloadError> => ok(blob)

export const describeDownloadError = (error: DownloadError): string => {
  switch (error.kind) {
    case 'decode_failed':
      return '生成した画像を読み込めませんでした。別の形式でお試しください。'
    case 'encode_failed':
      return '画像に変換できませんでした。別の形式でお試しください。'
    case 'unsupported':
      return 'このブラウザではこの形式で保存できません。SVG での保存をお試しください。'
  }
}
