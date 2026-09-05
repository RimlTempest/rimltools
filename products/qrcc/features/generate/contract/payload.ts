/**
 * エンコードされる内容。
 *
 * Rust 側の定義は `features/generate/engine/src/payload.rs`。
 */
import type { Brand, EmailAddress, HttpUrl, NonEmptyText, PhoneNumber } from '@qrcc/contract'

export type WifiAuth =
  | { readonly kind: 'nopass' }
  | { readonly kind: 'wep'; readonly password: string }
  | { readonly kind: 'wpa'; readonly password: string }

/** 検証は `features/generate/core/payload/geo.ts`。範囲は -90..=90。 */
export type Latitude = Brand<number, 'Latitude'>
/** 検証は `features/generate/core/payload/geo.ts`。範囲は -180..=180。 */
export type Longitude = Brand<number, 'Longitude'>

/**
 * `<input type="datetime-local">` の値そのままの形（`YYYY-MM-DDTHH:mm`）。
 * タイムゾーンを持たない「その場の時刻」として扱う。検証は
 * `features/generate/core/payload/event.ts`。
 */
export type CalendarTimestamp = Brand<string, 'CalendarTimestamp'>

export type CalendarEvent = {
  readonly subject: NonEmptyText
  readonly start: CalendarTimestamp
  readonly end: CalendarTimestamp
  readonly location: string
}

export type CodePayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | { readonly kind: 'tel'; readonly number: PhoneNumber }
  | {
      readonly kind: 'email'
      readonly to: EmailAddress
      readonly subject: string
      readonly body: string
    }
  | { readonly kind: 'sms'; readonly number: PhoneNumber; readonly body: string }
  | { readonly kind: 'geo'; readonly lat: Latitude; readonly lon: Longitude }
  | { readonly kind: 'event'; readonly event: CalendarEvent }
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
  tel: { label: '電話番号', description: '読み取ると電話をかける画面が開きます。' },
  email: { label: 'メール', description: '読み取るとメールの作成画面が開きます。' },
  sms: { label: 'SMS', description: '読み取るとメッセージの作成画面が開きます。' },
  geo: { label: '位置情報', description: '読み取ると地図アプリでその場所を開きます。' },
  event: { label: '予定', description: '読み取るとカレンダーに予定を追加できます。' },
  wifi: {
    label: 'Wi-Fi 設定',
    description: '読み取るとネットワークに接続できます。パスワードはコードに含まれます。',
  },
}

export const PAYLOAD_KINDS: readonly PayloadKind[] = Object.keys(PAYLOAD_META).filter(
  (key): key is PayloadKind => key in PAYLOAD_META,
)
