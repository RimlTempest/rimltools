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
import { err, ok, parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type { Result } from '@qrcc/contract'
import type { WebMcpTool } from '@qrcc/webmcp'
import { textResult } from '@qrcc/webmcp'
import { buildEmailPayload } from '../core/payload/email.ts'
import { buildEventPayload } from '../core/payload/event.ts'
import { buildGeoPayload } from '../core/payload/geo.ts'
import { buildSmsPayload } from '../core/payload/sms.ts'
import { buildTelPayload } from '../core/payload/tel.ts'
import { buildVCardPayload } from '../core/payload/vcard.ts'
import type { CodePayload, PayloadKind, RenderRequest, SymbologyKind } from '../contract/index.ts'
import {
  PAYLOAD_KINDS,
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

type ToolInput = Readonly<Record<string, unknown>>

const readString = (input: ToolInput, key: string): string | undefined =>
  typeof input[key] === 'string' ? input[key] : undefined

const readBoolean = (input: ToolInput, key: string): boolean => input[key] === true

const isRecord = (value: unknown): value is ToolInput => typeof value === 'object' && value !== null

/** `kind` ごとの入れ子オブジェクト（`tel`、`email` など）を取り出す。 */
const readObject = (input: ToolInput, key: string): ToolInput | undefined => {
  const value = input[key]
  return isRecord(value) ? value : undefined
}

/** 入れ子オブジェクトの文字列項目。無ければ空文字にする（ビルダーが判定する）。 */
const readNestedString = (input: ToolInput, objectKey: string, fieldKey: string): string => {
  const nested = readObject(input, objectKey)
  const value = nested === undefined ? undefined : readString(nested, fieldKey)
  return value ?? ''
}

const isSymbologyKind = (value: string): value is SymbologyKind =>
  SYMBOLOGY_KINDS.some((kind) => kind === value)

const isPayloadKind = (value: string): value is PayloadKind =>
  PAYLOAD_KINDS.some((kind) => kind === value)

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

/** `kind` を省略したときの既定の組み立て（従来どおりの url/text 自動判別）。 */
const buildAutoPayload = (input: ToolInput): Result<CodePayload, string> => {
  const rawText = readString(input, 'text')
  const text = rawText === undefined ? undefined : parseNonEmptyText(rawText)
  return text !== undefined && text.ok
    ? ok(buildPayload(text.value))
    : err('内容（text）を指定してください。')
}

/** まだこのツールから指定できない内容の種類向けの、エージェント向け文言。 */
const notYetSupported = (kind: PayloadKind): string =>
  `${PAYLOAD_META[kind].label}はこのツールからはまだ指定できません。`

/**
 * `kind` ごとに対応するビルダー（`features/generate/core/payload/`）を呼ぶ。
 * ここで失敗しても `throw` せず、エージェント向けの文言を `Result` の `error` で返す。
 */
const buildPayloadFromKind = (kind: PayloadKind, input: ToolInput): Result<CodePayload, string> => {
  switch (kind) {
    case 'text':
    case 'url':
      return buildAutoPayload(input)
    case 'tel': {
      const result = buildTelPayload(readNestedString(input, 'tel', 'number'))
      return result.ok
        ? result
        : err(
            '電話番号（tel.number）に国番号から始まる番号を指定してください（例: +819012345678）。',
          )
    }
    case 'email': {
      const result = buildEmailPayload({
        to: readNestedString(input, 'email', 'to'),
        subject: readNestedString(input, 'email', 'subject'),
        body: readNestedString(input, 'email', 'body'),
      })
      return result.ok
        ? result
        : err('メールの宛先（email.to）に正しいメールアドレスを指定してください。')
    }
    case 'sms': {
      const result = buildSmsPayload({
        number: readNestedString(input, 'sms', 'number'),
        body: readNestedString(input, 'sms', 'body'),
      })
      return result.ok
        ? result
        : err(
            'SMS の宛先（sms.number）に国番号から始まる番号を指定してください（例: +819012345678）。',
          )
    }
    case 'geo': {
      const result = buildGeoPayload({
        lat: readNestedString(input, 'geo', 'lat'),
        lon: readNestedString(input, 'geo', 'lon'),
      })
      if (result.ok) return result
      return err(
        result.error.kind === 'invalid_lat'
          ? '位置情報の緯度（geo.lat）に -90 から 90 の数値を指定してください。'
          : '位置情報の経度（geo.lon）に -180 から 180 の数値を指定してください。',
      )
    }
    case 'event': {
      const result = buildEventPayload({
        subject: readNestedString(input, 'event', 'subject'),
        start: readNestedString(input, 'event', 'start'),
        end: readNestedString(input, 'event', 'end'),
        location: readNestedString(input, 'event', 'location'),
      })
      if (result.ok) return result
      switch (result.error.kind) {
        case 'invalid_subject':
          return err('予定の件名（event.subject）を指定してください。')
        case 'invalid_start':
          return err('予定の開始日時（event.start）に YYYY-MM-DDTHH:mm の形式で指定してください。')
        case 'invalid_end':
          return err('予定の終了日時（event.end）に YYYY-MM-DDTHH:mm の形式で指定してください。')
        case 'end_before_start':
          return err('予定の終了日時（event.end）は開始日時より後にしてください。')
      }
    }
    case 'vcard': {
      const result = buildVCardPayload({
        name: readNestedString(input, 'vcard', 'name'),
        organization: readNestedString(input, 'vcard', 'organization'),
        tel: readNestedString(input, 'vcard', 'tel'),
        email: readNestedString(input, 'vcard', 'email'),
        url: readNestedString(input, 'vcard', 'url'),
      })
      if (result.ok) return result
      switch (result.error.kind) {
        case 'invalid_name':
          return err('名刺の氏名（vcard.name）を指定してください。')
        case 'invalid_tel':
          return err(
            '名刺の電話番号（vcard.tel）に国番号から始まる番号を指定してください（例: +819012345678）。',
          )
        case 'invalid_email':
          return err('名刺のメールアドレス（vcard.email）に正しい形式を指定してください。')
        case 'invalid_url':
          return err(
            '名刺の URL（vcard.url）に http:// か https:// で始まる URL を指定してください。',
          )
      }
    }
    case 'wifi':
      return err(notYetSupported('wifi'))
  }
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

/** `PAYLOAD_META` から、ツールの説明文に使う内容の種類の一覧を組み立てる。 */
const describePayloadKinds = (): string =>
  PAYLOAD_KINDS.map((kind) => PAYLOAD_META[kind].label).join('、')

/**
 * 生成ツール。
 *
 * `render` は既存の `RenderFn`（ブラウザ側 wasm か Worker）を composition root
 * から受け取る。ここでは呼び出すだけで、どちらを使うかは知らない。
 */
export const makeGenerateTool = (render: RenderFn): WebMcpTool => ({
  name: 'generate-code',
  description: `QR コードやバーコードを生成します。kind で内容の種類を指定します（省略時は内容が http(s) の URL として読めれば ${PAYLOAD_META.url.label}、読めなければ ${PAYLOAD_META.text.label}として符号化します）。対応する内容: ${describePayloadKinds()}。対応する符号: ${describeSymbologies()}。`,
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: PAYLOAD_KINDS,
        description: `内容の種類。省略時は text を http(s) の URL として読めれば ${PAYLOAD_META.url.label}、読めなければ ${PAYLOAD_META.text.label}として自動判別します。`,
      },
      text: {
        type: 'string',
        description:
          'コードにする内容。kind を省略、または text / url のとき使います。URL ならそのまま読み取り機で開けます。',
      },
      tel: {
        type: 'object',
        properties: {
          number: {
            type: 'string',
            description: '国番号から始まる電話番号（例: +819012345678）。',
          },
        },
        required: ['number'],
        description: `kind が tel のとき指定します。${PAYLOAD_META.tel.description}`,
      },
      email: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '送信先のメールアドレス。' },
          subject: { type: 'string', description: '件名（省略可）。' },
          body: { type: 'string', description: '本文（省略可）。' },
        },
        required: ['to'],
        description: `kind が email のとき指定します。${PAYLOAD_META.email.description}`,
      },
      sms: {
        type: 'object',
        properties: {
          number: {
            type: 'string',
            description: '国番号から始まる送信先の電話番号（例: +819012345678）。',
          },
          body: { type: 'string', description: '本文（省略可）。' },
        },
        required: ['number'],
        description: `kind が sms のとき指定します。${PAYLOAD_META.sms.description}`,
      },
      geo: {
        type: 'object',
        properties: {
          lat: { type: 'string', description: '緯度（-90 から 90）。' },
          lon: { type: 'string', description: '経度（-180 から 180）。' },
        },
        required: ['lat', 'lon'],
        description: `kind が geo のとき指定します。${PAYLOAD_META.geo.description}`,
      },
      event: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '件名。' },
          start: {
            type: 'string',
            description: '開始日時（YYYY-MM-DDTHH:mm）。',
          },
          end: {
            type: 'string',
            description: '終了日時（YYYY-MM-DDTHH:mm）。開始日時より後にしてください。',
          },
          location: { type: 'string', description: '場所（省略可）。' },
        },
        required: ['subject', 'start', 'end'],
        description: `kind が event のとき指定します。${PAYLOAD_META.event.description}`,
      },
      vcard: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '氏名。' },
          organization: { type: 'string', description: '組織名（省略可）。' },
          tel: { type: 'string', description: '電話番号（省略可、例: +819012345678）。' },
          email: { type: 'string', description: 'メールアドレス（省略可）。' },
          url: { type: 'string', description: 'URL（省略可、http:// か https:// で始まる）。' },
        },
        required: ['name'],
        description: `kind が vcard のとき指定します。${PAYLOAD_META.vcard.description}`,
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
  },
  execute: async (input) => {
    const kindInput = readString(input, 'kind')

    const payloadResult: Result<CodePayload, string> =
      kindInput === undefined
        ? buildAutoPayload(input)
        : isPayloadKind(kindInput)
          ? buildPayloadFromKind(kindInput, input)
          : err(`kind には次のいずれかを指定してください: ${PAYLOAD_KINDS.join('、')}`)

    if (!payloadResult.ok) {
      return textResult(payloadResult.error)
    }
    const payload = payloadResult.value

    const symbologyInput = readString(input, 'symbology')
    const symbologyKind =
      symbologyInput !== undefined && isSymbologyKind(symbologyInput)
        ? symbologyInput
        : DEFAULT_SYMBOLOGY_KIND

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
