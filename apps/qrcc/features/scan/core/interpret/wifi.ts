/**
 * `WIFI:` で始まる読み取り内容を解釈する。
 *
 * `WIFI:S:<SSID>;T:<暗号方式>;P:<パスワード>;H:<隠しSSIDか>;;` の形。
 * フィールドは `;` 区切り、値は `\` でエスケープされうる（`splitUnescaped` /
 * `unescapeField`）。パスワードは値として持つだけで、**画面には既定で
 * 出さない**（UI 側の責務。読み取り画面は人前で開かれることがある）。
 */
import type { Interpretation } from '../../contract/interpretation.ts'
import { splitUnescaped, unescapeField } from './escaping.ts'

const PREFIX = 'WIFI:'

export const interpretWifi = (text: string): Interpretation | undefined => {
  if (!text.toUpperCase().startsWith(PREFIX)) return undefined
  const body = text.slice(PREFIX.length)

  const fields = new Map<string, string>()
  for (const segment of splitUnescaped(body, ';')) {
    if (segment.length === 0) continue
    const separatorIndex = segment.indexOf(':')
    if (separatorIndex === -1) continue
    const key = segment.slice(0, separatorIndex).toUpperCase()
    const value = unescapeField(segment.slice(separatorIndex + 1))
    if (!fields.has(key)) fields.set(key, value)
  }

  const ssid = fields.get('S') ?? ''
  const auth = fields.get('T') ?? 'nopass'
  const password = fields.get('P')

  return {
    kind: 'wifi',
    ssid,
    auth,
    password: password === undefined || password.length === 0 ? undefined : password,
  }
}
