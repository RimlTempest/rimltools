/**
 * 電話番号の正規化と検証。`tel` と `sms` の両方が使う共通処理。
 *
 * 電話番号は E.164（`+` に続く国番号付きの数字列）で検証する
 * （`@qrcc/contract` の `PhoneNumber`）。ハイフン・空白・中黒・全角の数字と
 * `＋` は、利用者が入力しやすい形として許容し、ここで正規化してから検証する。
 */
import type { PhoneNumber, Result } from '@qrcc/contract'
import { parsePhoneNumber } from '@qrcc/contract'

export type PhoneParseError = { readonly kind: 'invalid_number' }

const FULLWIDTH_CHARS = '０１２３４５６７８９＋'
const HALFWIDTH_CHARS = '0123456789+'

const toHalfWidth = (value: string): string =>
  Array.from(value)
    .map((character) => {
      const index = FULLWIDTH_CHARS.indexOf(character)
      return index === -1 ? character : (HALFWIDTH_CHARS[index] ?? character)
    })
    .join('')

/** ハイフン・中黒・空白の類を取り除く。国番号の `+` と数字だけを残す。 */
const stripSeparators = (value: string): string => value.replace(/[\s\-‐-‒–—―ー・]/g, '')

/** 入力された電話番号を正規化してから検証する。 */
export const parsePhoneInput = (input: string): Result<PhoneNumber, PhoneParseError> => {
  const normalized = stripSeparators(toHalfWidth(input))
  const parsed = parsePhoneNumber(normalized)
  return parsed.ok ? parsed : { ok: false, error: { kind: 'invalid_number' } }
}
