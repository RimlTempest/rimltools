/**
 * Wi-Fi 設定の内容の種類。
 *
 * 003 より前からある種類で、これまで専用のビルダーが無く、画面
 * （`generate-screen.tsx` の `buildPayload`）が直接組み立てていた。他の内容の
 * 種類と検証の置き場所を揃えるために切り出す。SSID だけが必須で、パスワード
 * が空なら認証なし（`nopass`）、指定があれば WPA として扱う（画面と同じ振る舞い）。
 */
import type { Result } from '@qrcc/contract'
import { err, ok, parseNonEmptyText } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'

export type WifiError = { readonly kind: 'invalid_ssid' }
export type WifiPayload = Extract<CodePayload, { readonly kind: 'wifi' }>

export type WifiInput = {
  readonly ssid: string
  readonly password: string
  readonly hidden: boolean
}

export const buildWifiPayload = (input: WifiInput): Result<WifiPayload, WifiError> => {
  const ssid = parseNonEmptyText(input.ssid)
  if (!ssid.ok) return err({ kind: 'invalid_ssid' })

  return ok({
    kind: 'wifi',
    ssid: ssid.value,
    auth:
      input.password.length === 0 ? { kind: 'nopass' } : { kind: 'wpa', password: input.password },
    hidden: input.hidden,
  })
}
