/**
 * 電話番号の内容の種類。
 *
 * 電話番号は E.164（`+` に続く国番号付きの数字列）で検証する
 * （`@qrcc/contract` の `PhoneNumber`）。ハイフン・空白・中黒・全角の数字と
 * `＋` は、利用者が入力しやすい形として許容し、ここで正規化してから検証する。
 */
import type { Result } from '@qrcc/contract'
import { err, ok, parsePhoneNumber } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'

export type TelError = { readonly kind: 'invalid_number' }
export type TelPayload = Extract<CodePayload, { readonly kind: 'tel' }>

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

/** 入力された電話番号を正規化して `CodePayload` を組み立てる。 */
export const buildTelPayload = (input: string): Result<TelPayload, TelError> => {
  const normalized = stripSeparators(toHalfWidth(input))
  const parsed = parsePhoneNumber(normalized)
  return parsed.ok ? ok({ kind: 'tel', number: parsed.value }) : err({ kind: 'invalid_number' })
}
