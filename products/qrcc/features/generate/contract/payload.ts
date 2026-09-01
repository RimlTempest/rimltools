/**
 * エンコードされる内容。
 *
 * Rust 側の定義は `features/generate/engine/src/payload.rs`。
 */
import type { HttpUrl, NonEmptyText } from '@qrcc/contract'

export type WifiAuth =
  | { readonly kind: 'nopass' }
  | { readonly kind: 'wep'; readonly password: string }
  | { readonly kind: 'wpa'; readonly password: string }

export type CodePayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | {
      readonly kind: 'wifi'
      readonly ssid: NonEmptyText
      readonly auth: WifiAuth
      readonly hidden: boolean
    }

export type PayloadKind = CodePayload['kind']

type PayloadMeta = {
  readonly label: string
  readonly description: string
}

/** `CodePayload` にメンバーを足すと、ここも埋めるまでコンパイルが通らない。 */
export const PAYLOAD_META: { readonly [K in PayloadKind]: PayloadMeta } = {
  text: { label: 'テキスト', description: '任意の文字列をそのまま入れます。' },
  url: { label: 'URL', description: '読み取るとブラウザで開きます。' },
  wifi: {
    label: 'Wi-Fi 設定',
    description: '読み取るとネットワークに接続できます。パスワードはコードに含まれます。',
  },
}

export const PAYLOAD_KINDS: readonly PayloadKind[] = Object.keys(PAYLOAD_META).filter(
  (key): key is PayloadKind => key in PAYLOAD_META,
)
