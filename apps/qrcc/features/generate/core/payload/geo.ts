/**
 * 位置情報の内容の種類。
 *
 * 緯度は -90..=90、経度は -180..=180 の範囲を持つ有限の数値で検証する。
 * フォームの入力は文字列なので、ここで数値に直してから検証する。
 */
import type { Result } from '@qrcc/contract'
import { err, makeParser, ok } from '@qrcc/contract'
import type { CodePayload, Latitude, Longitude } from '../../contract/payload.ts'

export type GeoError = { readonly kind: 'invalid_lat' } | { readonly kind: 'invalid_lon' }
export type GeoPayload = Extract<CodePayload, { readonly kind: 'geo' }>

export type GeoInput = {
  readonly lat: string
  readonly lon: string
}

const isLatitude = (value: number): value is Latitude =>
  Number.isFinite(value) && value >= -90 && value <= 90
const isLongitude = (value: number): value is Longitude =>
  Number.isFinite(value) && value >= -180 && value <= 180

const parseLatitude = makeParser(isLatitude, (): GeoError => ({ kind: 'invalid_lat' }))
const parseLongitude = makeParser(isLongitude, (): GeoError => ({ kind: 'invalid_lon' }))

/** 空文字・空白だけの入力を明示的に数値なしとして扱う（`Number('')` は 0 になるため）。 */
const toNumber = (raw: string): number | undefined => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

export const buildGeoPayload = (input: GeoInput): Result<GeoPayload, GeoError> => {
  const latNumber = toNumber(input.lat)
  if (latNumber === undefined) return err({ kind: 'invalid_lat' })
  const lat = parseLatitude(latNumber)
  if (!lat.ok) return lat

  const lonNumber = toNumber(input.lon)
  if (lonNumber === undefined) return err({ kind: 'invalid_lon' })
  const lon = parseLongitude(lonNumber)
  if (!lon.ok) return lon

  return ok({ kind: 'geo', lat: lat.value, lon: lon.value })
}
