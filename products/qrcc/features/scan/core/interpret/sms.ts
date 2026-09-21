/**
 * SMS の QR を解釈する。2 つの流儀に対応する:
 *
 * - `SMSTO:<番号>:<本文>`（携帯電話機でよく使われる旧来の書式）
 * - `sms:<番号>?body=<本文>`（RFC 5724 の URI 書式）
 */
import type { Interpretation } from '../../contract/interpretation.ts'

const SMSTO_PREFIX = 'SMSTO:'
const SMS_URI_PREFIX = 'sms:'

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const interpretSmsto = (text: string): Interpretation | undefined => {
  if (!text.toUpperCase().startsWith(SMSTO_PREFIX)) return undefined
  const rest = text.slice(SMSTO_PREFIX.length)
  // 番号は : を含められないので、2 個目の : までが番号、以降が本文（本文は : を含みうる）
  const separatorIndex = rest.indexOf(':')
  const number = (separatorIndex === -1 ? rest : rest.slice(0, separatorIndex)).trim()
  if (number.length === 0) return undefined
  const body = separatorIndex === -1 ? undefined : rest.slice(separatorIndex + 1)
  return { kind: 'sms', number, body: body === undefined || body.length === 0 ? undefined : body }
}

const interpretSmsUri = (text: string): Interpretation | undefined => {
  if (!text.toLowerCase().startsWith(SMS_URI_PREFIX)) return undefined
  const rest = text.slice(SMS_URI_PREFIX.length)
  const queryIndex = rest.indexOf('?')
  const number = (queryIndex === -1 ? rest : rest.slice(0, queryIndex)).trim()
  if (number.length === 0) return undefined

  const query = queryIndex === -1 ? '' : rest.slice(queryIndex + 1)
  let body: string | undefined
  for (const pair of query.split('&')) {
    if (pair.length === 0) continue
    const separatorIndex = pair.indexOf('=')
    const key = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    if (key.toLowerCase() !== 'body') continue
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)
    body = safeDecode(rawValue)
    break
  }

  return { kind: 'sms', number, body }
}

export const interpretSms = (text: string): Interpretation | undefined =>
  interpretSmsto(text) ?? interpretSmsUri(text)
