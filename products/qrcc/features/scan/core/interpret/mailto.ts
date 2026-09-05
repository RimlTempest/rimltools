/**
 * `mailto:` で始まる読み取り内容を解釈する（RFC 6068 の一部だけ）。
 *
 * 出すのは宛先と件名だけ（表のとおり）。本文などその他のクエリは無視する。
 */
import type { Interpretation } from '../../contract/interpretation.ts'

const PREFIX = 'mailto:'

/** 壊れた % エンコードでも例外を投げない。 */
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const findQueryParam = (query: string, key: string): string | undefined => {
  for (const pair of query.split('&')) {
    if (pair.length === 0) continue
    const separatorIndex = pair.indexOf('=')
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    if (rawKey.toLowerCase() !== key) continue
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)
    return safeDecode(rawValue)
  }
  return undefined
}

export const interpretMailto = (text: string): Interpretation | undefined => {
  if (!text.toLowerCase().startsWith(PREFIX)) return undefined
  const body = text.slice(PREFIX.length)
  const queryIndex = body.indexOf('?')
  const rawTo = queryIndex === -1 ? body : body.slice(0, queryIndex)
  const to = safeDecode(rawTo).trim()
  // 宛先が空なら "mailto:" という形をした無意味な文字列でしかない。plain に譲る
  if (to.length === 0) return undefined

  const query = queryIndex === -1 ? '' : body.slice(queryIndex + 1)
  const subject = findQueryParam(query, 'subject')

  return { kind: 'email', to, subject }
}
