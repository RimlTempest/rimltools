/**
 * 電話番号の内容の種類。正規化と検証は `phone.ts`（`tel` と `sms` で共有）。
 */
import type { Result } from '@qrcc/contract'
import { ok } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'
import type { PhoneParseError } from './phone.ts'
import { parsePhoneInput } from './phone.ts'

export type TelError = PhoneParseError
export type TelPayload = Extract<CodePayload, { readonly kind: 'tel' }>

/** 入力された電話番号を正規化して `CodePayload` を組み立てる。 */
export const buildTelPayload = (input: string): Result<TelPayload, TelError> => {
  const number = parsePhoneInput(input)
  return number.ok ? ok({ kind: 'tel', number: number.value }) : number
}
