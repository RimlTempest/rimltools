/**
 * 生成を WebMCP のツールとして公開する（docs/adr/0010-webmcp.md）。
 *
 * **画面の状態は動かさない。** 渡された `text` から `RenderRequest` を組み立てて
 * `render` を呼び、結果を文章にして返すだけ。DOM にも wasm にも直接依存しない
 * （`render` を引数で受け取るので、テストでは偽物を渡せる）。
 *
 * `inputSchema` の符号（symbology）は `SYMBOLOGY_KINDS` から組み立てる。
 * 直書きすると、対応する符号が増えても schema が追随しない。
 */
import { parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type { WebMcpTool } from '@qrcc/webmcp'
import { textResult } from '@qrcc/webmcp'
import type { CodePayload, RenderRequest, SymbologyKind } from '../contract/index.ts'
import {
  PAYLOAD_META,
  SYMBOLOGY_KINDS,
  SYMBOLOGY_META,
  describeRenderError,
  isPayloadCompatible,
} from '../contract/index.ts'
import { describeWarning } from './describe-warning.ts'
import type { RenderFn } from './generate-screen.tsx'

const DEFAULT_SYMBOLOGY_KIND: SymbologyKind = 'qr'

/** 見た目の既定値。生成画面の `INITIAL`（generate-screen.tsx）と揃える。 */
const DEFAULT_FOREGROUND = '#000000'
const DEFAULT_BACKGROUND = '#ffffff'
const DEFAULT_SCALE = 6

const readString = (input: Readonly<Record<string, unknown>>, key: string): string | undefined =>
  typeof input[key] === 'string' ? input[key] : undefined

const readBoolean = (input: Readonly<Record<string, unknown>>, key: string): boolean =>
  input[key] === true

const isSymbologyKind = (value: string): value is SymbologyKind =>
  SYMBOLOGY_KINDS.some((kind) => kind === value)

/**
 * 内容から payload を組み立てる。
 *
 * エージェントは種類を間違えて渡してくるので、URL として読めれば `url`、
 * 読めなければそのまま `text` として扱う（拒否しない）。
 */
const buildPayload = (text: string): CodePayload => {
  const url = parseHttpUrl(text)
  return url.ok ? { kind: 'url', url: url.value } : { kind: 'text', text }
}

/**
 * `RenderRequest` を組み立てる。
 * `features/generate/ui/generate-screen.tsx` の `buildRequest` と同じ形にする。
 */
const buildRenderRequest = (
  payload: CodePayload,
  symbologyKind: SymbologyKind,
): RenderRequest | undefined => {
  const foreground = parseHexColor(DEFAULT_FOREGROUND)
  const background = parseHexColor(DEFAULT_BACKGROUND)
  if (!foreground.ok || !background.ok) return undefined

  return {
    payload,
    symbology: SYMBOLOGY_META[symbologyKind].defaults,
    style: {
      foreground: foreground.value,
      background: { kind: 'solid', color: background.value },
      scale: DEFAULT_SCALE,
      quiet_zone: null,
      module_shape: 'square',
      bar_height: 40,
      human_readable: true,
    },
    output: 'svg',
  }
}

/** `SYMBOLOGY_META` から、ツールの説明文に使う符号の一覧を組み立てる。 */
const describeSymbologies = (): string =>
  SYMBOLOGY_KINDS.map((kind) => SYMBOLOGY_META[kind].label).join('、')

/**
 * 生成ツール。
 *
 * `render` は既存の `RenderFn`（ブラウザ側 wasm か Worker）を composition root
 * から受け取る。ここでは呼び出すだけで、どちらを使うかは知らない。
 */
export const makeGenerateTool = (render: RenderFn): WebMcpTool => ({
  name: 'generate-code',
  description: `QR コードやバーコードを生成します。内容が http(s) の URL として読めれば ${PAYLOAD_META.url.label}、読めなければ ${PAYLOAD_META.text.label}として符号化します。対応する符号: ${describeSymbologies()}。`,
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'コードにする内容。URL ならそのまま読み取り機で開けます。',
      },
      symbology: {
        type: 'string',
        enum: SYMBOLOGY_KINDS,
        description: `使用する符号体系。省略時は ${SYMBOLOGY_META[DEFAULT_SYMBOLOGY_KIND].label}。`,
      },
      includeSvg: {
        type: 'boolean',
        description:
          '生成した SVG の本文も返すか（既定は false）。大きな SVG を毎回返すとエージェントの文脈を消費します。',
      },
    },
    required: ['text'],
  },
  execute: async (input) => {
    const rawText = readString(input, 'text')
    const text = rawText === undefined ? undefined : parseNonEmptyText(rawText)
    if (text === undefined || !text.ok) {
      return textResult('内容（text）を指定してください。')
    }

    const symbologyInput = readString(input, 'symbology')
    const symbologyKind =
      symbologyInput !== undefined && isSymbologyKind(symbologyInput)
        ? symbologyInput
        : DEFAULT_SYMBOLOGY_KIND

    const payload = buildPayload(text.value)

    if (!isPayloadCompatible(payload.kind, symbologyKind)) {
      return textResult(
        `${PAYLOAD_META[payload.kind].label}は${SYMBOLOGY_META[symbologyKind].label}に載せられません。別の内容か符号を指定してください。`,
      )
    }

    const request = buildRenderRequest(payload, symbologyKind)
    if (request === undefined) {
      return textResult('内部エラー: 既定の見た目設定が不正です。')
    }

    const outcome = await render(request)
    if (!outcome.ok) {
      return textResult(
        outcome.error.kind === 'unavailable'
          ? `生成できませんでした（${outcome.error.detail}）。しばらく待ってからもう一度お試しください。`
          : describeRenderError(outcome.error),
      )
    }

    const includeSvg = readBoolean(input, 'includeSvg')
    const lines = [
      outcome.value.description,
      `大きさ: 幅 ${outcome.value.width} × 高さ ${outcome.value.height}`,
    ]
    if (outcome.value.warnings.length > 0) {
      lines.push(outcome.value.warnings.map(describeWarning).join(' '))
    }
    if (includeSvg) lines.push(outcome.value.body)

    return textResult(lines.join('\n'))
  },
})
