/**
 * D1 の JSON 1 列（`payload` / `symbology` / `style`）を読み戻すパーサ。
 *
 * 検索に使う列だけを実列に出し、残りは JSON でまとめて持つ（無料枠の row read
 * を節約するため / docs/domain-model.md 9 節）。そのぶん**読み出し時に必ず
 * ここを通す**ことがスキーマ変更への耐性になる。
 *
 * 型そのものは `@qrcc/generate/contract` が持つ。ここにあるのは
 * 「ワイヤ上の unknown をその型に落とす」手続きだけで、型の定義は増やさない。
 */
import { ok, parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type {
  CodePayload,
  ModuleShape,
  Paint,
  RenderStyle,
  Symbology,
  WifiAuth,
} from '@qrcc/generate/contract'
import type { Decoded } from './wire.ts'
import { fail, isRecord, readBoolean, readNumber, readString } from './wire.ts'

const MODULE_SHAPES: readonly ModuleShape[] = ['square', 'dot', 'rounded']

const decodeWifiAuth = (value: unknown): Decoded<WifiAuth> => {
  if (!isRecord(value)) return fail('wifi auth must be an object')
  const kind = readString(value, 'kind')
  if (kind === 'nopass') return ok({ kind })
  if (kind !== 'wep' && kind !== 'wpa') return fail(`unknown wifi auth kind: ${String(kind)}`)
  const password = readString(value, 'password')
  return password === undefined ? fail(`${kind} requires a password`) : ok({ kind, password })
}

export const decodeCodePayload = (value: unknown): Decoded<CodePayload> => {
  if (!isRecord(value)) return fail('payload must be an object')
  const kind = readString(value, 'kind')

  if (kind === 'text') {
    const text = readString(value, 'text')
    return text === undefined ? fail('text payload requires "text"') : ok({ kind, text })
  }
  if (kind === 'url') {
    const url = parseHttpUrl(readString(value, 'url') ?? '')
    return url.ok ? ok({ kind, url: url.value }) : fail('url payload requires an http(s) URL')
  }
  if (kind === 'wifi') {
    const ssid = parseNonEmptyText(readString(value, 'ssid') ?? '')
    if (!ssid.ok) return fail('wifi payload requires a non-empty ssid')
    const auth = decodeWifiAuth(value['auth'])
    if (!auth.ok) return auth
    const hidden = readBoolean(value, 'hidden')
    return hidden === undefined
      ? fail('wifi payload requires "hidden"')
      : ok({ kind, ssid: ssid.value, auth: auth.value, hidden })
  }
  return fail(`unknown payload kind: ${String(kind)}`)
}

export const decodeSymbology = (value: unknown): Decoded<Symbology> => {
  if (!isRecord(value)) return fail('symbology must be an object')
  const kind = readString(value, 'kind')

  if (kind === 'qr') {
    const ec = readString(value, 'ec')
    return ec === 'L' || ec === 'M' || ec === 'Q' || ec === 'H'
      ? ok({ kind, ec })
      : fail(`unknown qr error correction: ${String(ec)}`)
  }
  if (kind === 'code128') {
    const charset = readString(value, 'charset')
    return charset === 'auto' || charset === 'a' || charset === 'b' || charset === 'c'
      ? ok({ kind, charset })
      : fail(`unknown code128 charset: ${String(charset)}`)
  }
  if (kind === 'ean13') return ok({ kind })
  return fail(`unknown symbology kind: ${String(kind)}`)
}

const decodePaint = (value: unknown): Decoded<Paint> => {
  if (!isRecord(value)) return fail('paint must be an object')
  const kind = readString(value, 'kind')
  if (kind === 'transparent') return ok({ kind })
  if (kind !== 'solid') return fail(`unknown paint kind: ${String(kind)}`)
  const color = parseHexColor(readString(value, 'color') ?? '')
  return color.ok ? ok({ kind, color: color.value }) : fail('solid paint requires a hex color')
}

const isModuleShape = (value: string | undefined): value is ModuleShape =>
  MODULE_SHAPES.some((shape) => shape === value)

export const decodeRenderStyle = (value: unknown): Decoded<RenderStyle> => {
  if (!isRecord(value)) return fail('style must be an object')

  const foreground = parseHexColor(readString(value, 'foreground') ?? '')
  if (!foreground.ok) return fail('style requires a hex "foreground"')
  const background = decodePaint(value['background'])
  if (!background.ok) return background

  const scale = readNumber(value, 'scale')
  const barHeight = readNumber(value, 'bar_height')
  const moduleShape = readString(value, 'module_shape')
  const humanReadable = readBoolean(value, 'human_readable')
  const rawQuietZone = value['quiet_zone']
  const quietZone = rawQuietZone === null ? null : readNumber(value, 'quiet_zone')

  if (scale === undefined || barHeight === undefined || humanReadable === undefined) {
    return fail('style requires "scale", "bar_height" and "human_readable"')
  }
  if (!isModuleShape(moduleShape)) return fail(`unknown module shape: ${String(moduleShape)}`)
  if (quietZone === undefined) return fail('style requires "quiet_zone" (a number or null)')

  return ok({
    foreground: foreground.value,
    background: background.value,
    scale,
    quiet_zone: quietZone,
    module_shape: moduleShape,
    bar_height: barHeight,
    human_readable: humanReadable,
  })
}
