/**
 * 読み取りを WebMCP のツールとして公開する（docs/adr/0010-webmcp.md）。
 *
 * **`data:` URL 以外は絶対に受け付けない。** `fetch` は使わない
 * （使うと将来 `https:` を通す改変が入りやすくなるため、そもそも経路を
 * 持たせない）。任意の URL を取りに行けると、利用者のブラウザを踏み台にして
 * 社内ネットワークや認証付きリソースを読ませられる（レビューで特に見る点）。
 *
 * 読み取った生テキストは `interpret`（`../core/index.ts`）で構造化する。
 * 解釈が外れても元の文字列が失われないよう、**生テキストと解釈結果の両方**
 * を本文に入れる。
 */
import type { Result } from '@qrcc/contract'
import type { WebMcpTool } from '@qrcc/webmcp'
import { textResult } from '@qrcc/webmcp'
import type { DecodeResponse, Detection, ScanFailure } from '../contract/index.ts'
import { describeScanFailure } from '../contract/index.ts'
import { interpret } from '../core/index.ts'

/** サーバ側デコードの上限（`docs/free-tier-budget.md`）と揃える。 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/** `data:<mime>;base64,<payload>` だけを受け付ける。それ以外の形は全部拒否する。 */
const DATA_URL_PATTERN = /^data:[^,;]*;base64,(.*)$/s

/**
 * `data:` URL から画像のバイト列を取り出す。
 * `fetch` は使わず、自前でパースする。base64 以外・壊れた base64 は
 * `undefined` を返し、呼び出し元が理由付きで拒否する。
 */
const decodeDataUrl = (value: string): Uint8Array | undefined => {
  const match = DATA_URL_PATTERN.exec(value)
  const base64 = match?.[1]
  if (base64 === undefined) return undefined

  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return undefined
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const readString = (input: Readonly<Record<string, unknown>>, key: string): string | undefined =>
  typeof input[key] === 'string' ? input[key] : undefined

const describeDetection = (detection: Detection): string =>
  [
    `symbology: ${detection.symbology}`,
    `text: ${detection.text}`,
    `interpretation: ${JSON.stringify(interpret(detection.text))}`,
  ].join('\n')

const describeDetections = (response: DecodeResponse): string =>
  response.detections.length === 0
    ? 'コードが見つかりませんでした。画像にコード全体が写っているか確認してください。'
    : response.detections.map(describeDetection).join('\n\n')

/**
 * 読み取りツール。
 *
 * `decodeBytes` は composition root がブラウザ側 wasm から組み立てて渡す
 * （DOM にも wasm にも直接依存しない。テストでは偽物を渡せる）。
 */
export const makeDecodeTool = (
  decodeBytes: (bytes: Uint8Array) => Promise<Result<DecodeResponse, ScanFailure>>,
): WebMcpTool => ({
  name: 'decode-code-image',
  description:
    'QR コードやバーコードの画像を読み取ります。**data: URL のみ受け付けます**（http(s) の URL は'
    + '利用者のブラウザを踏み台にできてしまうため、絶対に取得しません）。',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description:
          '読み取る画像。data:<mime>;base64,<payload> の形式の data: URL のみ受け付けます。',
      },
    },
    required: ['image'],
  },
  execute: async (input) => {
    const image = readString(input, 'image')
    if (image === undefined || !image.startsWith('data:')) {
      return textResult(
        'data: URL 以外は受け付けません。base64 で符号化した data:<mime>;base64,<payload> の形式で渡してください。',
      )
    }

    const bytes = decodeDataUrl(image)
    if (bytes === undefined) {
      return textResult(
        'data: URL を読み取れませんでした。data:<mime>;base64,<payload> の形式（base64）で渡してください。',
      )
    }

    if (bytes.length > MAX_IMAGE_BYTES) {
      return textResult(`画像が大きすぎます（上限 ${MAX_IMAGE_BYTES} バイト）。`)
    }

    const outcome = await decodeBytes(bytes)
    if (!outcome.ok) return textResult(describeScanFailure(outcome.error))

    return textResult(describeDetections(outcome.value))
  },
})
