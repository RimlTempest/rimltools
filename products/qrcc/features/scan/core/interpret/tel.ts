/**
 * `tel:` で始まる読み取り内容を解釈する。
 *
 * `tel:` はリンクにしない（既存のセキュリティ判断を緩めない。UI 側で
 * `href` を作らせないため、そもそも URL 化しない値として持つ）。
 */
import type { Interpretation } from '../../contract/interpretation.ts'

const PREFIX = 'tel:'

export const interpretTel = (text: string): Interpretation | undefined => {
  if (!text.toLowerCase().startsWith(PREFIX)) return undefined
  const number = text.slice(PREFIX.length).trim()
  // 番号が空なら "tel:" という形をした無意味な文字列でしかない。plain に譲る
  if (number.length === 0) return undefined
  return { kind: 'tel', number }
}
