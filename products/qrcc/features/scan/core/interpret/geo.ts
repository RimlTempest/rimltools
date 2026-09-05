/**
 * `geo:` で始まる読み取り内容を解釈する（RFC 5870 の一部だけ）。
 *
 * `geo:<緯度>,<経度>[,<高度>][;<パラメータ>]` のうち、緯度・経度だけを出す
 * （表のとおり）。
 */
import type { Interpretation } from '../../contract/interpretation.ts'

const PREFIX = 'geo:'

export const interpretGeo = (text: string): Interpretation | undefined => {
  if (!text.toLowerCase().startsWith(PREFIX)) return undefined
  const rest = text.slice(PREFIX.length)
  // ; 以降はパラメータ（u=精度 など）。緯度経度には関係ないので切り捨てる
  const coordinates = rest.split(';')[0] ?? ''
  const parts = coordinates.split(',')
  const rawLat = parts[0]?.trim()
  const rawLon = parts[1]?.trim()
  if (rawLat === undefined || rawLon === undefined || rawLat === '' || rawLon === '') {
    return undefined
  }

  const lat = Number(rawLat)
  const lon = Number(rawLon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined

  return { kind: 'geo', lat, lon }
}
