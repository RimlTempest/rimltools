/**
 * `MECARD:` で始まる読み取り内容を解釈する。
 *
 * `MECARD:N:<氏名>;TEL:<電話>;EMAIL:<メール>;ORG:<組織>;;` の形。
 * WIFI: と同じエスケープ規則（`escaping.ts`）を使う。
 */
import type { Interpretation } from '../../contract/interpretation.ts'
import { splitUnescaped, unescapeField } from './escaping.ts'

const PREFIX = 'MECARD:'

/** MeCard の N は「姓,名」。表示用に読点区切りをスペースに直す。 */
const formatName = (rawName: string): string =>
  rawName
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')

export const interpretMecard = (text: string): Interpretation | undefined => {
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

  const rawName = fields.get('N')
  const name = rawName === undefined ? undefined : formatName(rawName)
  const tel = fields.get('TEL')
  const email = fields.get('EMAIL')
  const org = fields.get('ORG')

  return {
    kind: 'contact',
    fields: {
      name: name === undefined || name.length === 0 ? undefined : name,
      tel: tel === undefined || tel.length === 0 ? undefined : tel,
      email: email === undefined || email.length === 0 ? undefined : email,
      org: org === undefined || org.length === 0 ? undefined : org,
    },
  }
}
