/**
 * ワイヤ（RPC の JSON）を読むための最小の道具。
 *
 * 境界を越える値はすべて `unknown` から始め、ここを通してから型を付ける。
 * 日時は Unix 秒で運ぶ（D1 の列がそうなっているため。ISO 文字列に直すのは
 * 表示の直前だけでよく、往復で情報が変わらない）。
 */
import type { Result } from '@qrcc/contract'
import { err } from '@qrcc/contract'

/** `ValueDecoder` と同じ形。RPC の応答検証にそのまま渡せる。 */
export type DecodeIssue = { readonly detail: string }

export type Decoded<T> = Result<T, DecodeIssue>

export const fail = (detail: string): Result<never, DecodeIssue> => err({ detail })

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const readString = (source: Record<string, unknown>, key: string): string | undefined =>
  typeof source[key] === 'string' ? source[key] : undefined

export const readNumber = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : undefined

export const readBoolean = (source: Record<string, unknown>, key: string): boolean | undefined =>
  typeof source[key] === 'boolean' ? source[key] : undefined

const MILLISECONDS = 1000

export const fromUnixSeconds = (seconds: number): Date => new Date(seconds * MILLISECONDS)

export const toUnixSeconds = (at: Date): number => Math.floor(at.getTime() / MILLISECONDS)

/**
 * 日時列を読む。欠けていても `undefined` にはせず、呼び出し側に判断させる。
 */
export const readDate = (source: Record<string, unknown>, key: string): Date | undefined => {
  const seconds = readNumber(source, key)
  return seconds === undefined ? undefined : fromUnixSeconds(seconds)
}

/** null と「欠けている」を区別して読む。`null` は「値なし」を意味する。 */
export const readNullableDate = (
  source: Record<string, unknown>,
  key: string,
): Decoded<Date | undefined> => {
  if (source[key] === null) return { ok: true, value: undefined }
  const at = readDate(source, key)
  return at === undefined
    ? fail(`"${key}" must be a Unix timestamp or null`)
    : { ok: true, value: at }
}
