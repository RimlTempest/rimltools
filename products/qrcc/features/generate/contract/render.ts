/**
 * `render` メソッドの要求と応答（docs/api-contract.md）。
 *
 * Rust 側の定義は `features/generate/engine/src/render.rs`。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { CodePayload } from './payload.ts'
import type { RenderStyle } from './style.ts'
import type { Symbology, SymbologyKind } from './symbology.ts'

export type OutputFormat = 'svg'

export type RenderRequest = {
  readonly payload: CodePayload
  readonly symbology: Symbology
  readonly style: RenderStyle
  readonly output: OutputFormat
}

/**
 * 生成は止めないが、利用者に伝えるべきこと。
 * **警告とエラーを分ける** — コントラスト不足で拒否すると表現の自由を奪う。
 */
export type RenderWarning =
  | { readonly kind: 'low_contrast'; readonly ratio: number; readonly minimum: number }
  | { readonly kind: 'transparent_background' }

export type RenderResponse = {
  readonly body: string
  readonly content_type: string
  readonly width: number
  readonly height: number
  /** 画像だけで提供しないための、人が読める内容（WCAG 1.1.1）。 */
  readonly description: string
  readonly warnings: readonly RenderWarning[]
}

export type RenderError =
  | {
      readonly kind: 'payload_too_long'
      readonly symbology: string
      readonly max: number
      readonly actual: number
    }
  | {
      readonly kind: 'incompatible_payload'
      readonly symbology: string
      readonly reason: string
    }
  | { readonly kind: 'invalid_option'; readonly field: string; readonly reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (source: Record<string, unknown>, key: string): string | undefined =>
  typeof source[key] === 'string' ? source[key] : undefined

const readNumber = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : undefined

const decodeWarning = (value: unknown): RenderWarning | undefined => {
  if (!isRecord(value)) return undefined
  const kind = readString(value, 'kind')
  if (kind === 'transparent_background') return { kind }
  if (kind === 'low_contrast') {
    const ratio = readNumber(value, 'ratio')
    const minimum = readNumber(value, 'minimum')
    return ratio === undefined || minimum === undefined ? undefined : { kind, ratio, minimum }
  }
  return undefined
}

/**
 * ネットワーク越しの応答を検証する。
 * 未知の警告は黙って捨てず、全体をエラーにする（表示漏れに気づけるように）。
 */
export const decodeRenderResponse = (
  value: unknown,
): Result<RenderResponse, { readonly detail: string }> => {
  if (!isRecord(value)) return err({ detail: 'render response must be an object' })

  const body = readString(value, 'body')
  const contentType = readString(value, 'content_type')
  const description = readString(value, 'description')
  const width = readNumber(value, 'width')
  const height = readNumber(value, 'height')
  const rawWarnings = value['warnings']

  if (
    body === undefined
    || contentType === undefined
    || description === undefined
    || width === undefined
    || height === undefined
    || !Array.isArray(rawWarnings)
  ) {
    return err({ detail: 'render response is missing required fields' })
  }

  const warnings: RenderWarning[] = []
  for (const raw of rawWarnings) {
    const warning = decodeWarning(raw)
    if (warning === undefined)
      return err({ detail: `unknown render warning: ${JSON.stringify(raw)}` })
    warnings.push(warning)
  }

  return ok({ body, content_type: contentType, description, width, height, warnings })
}

/** 画面に出す文言。エラーの `kind` ごとに、次にどうすればよいかを示す。 */
export const describeRenderError = (error: RenderError): string => {
  switch (error.kind) {
    case 'payload_too_long':
      return `内容が長すぎます（${error.actual} 文字）。${error.symbology} に入るのは ${error.max} 文字までです。誤り訂正レベルを下げるか、内容を短くしてください。`
    case 'incompatible_payload':
      return `この内容は ${error.symbology} で表せません（${error.reason}）。別のシンボル体系を選んでください。`
    case 'invalid_option':
      return `設定「${error.field}」が不正です（${error.reason}）。`
  }
}

/** その symbology で使える payload かを判定する。 */
export const isPayloadCompatible = (
  payloadKind: CodePayload['kind'],
  symbologyKind: SymbologyKind,
): boolean => {
  switch (symbologyKind) {
    case 'qr':
      return true
    // EAN-13 は数字だけなので、テキスト以外は入れられない
    case 'ean13':
      return payloadKind === 'text'
    // Code128 は ASCII のみ。URL とテキストは載るが、日本語混じりの Wi-Fi 設定は載らない
    case 'code128':
      return payloadKind === 'text' || payloadKind === 'url'
  }
}
