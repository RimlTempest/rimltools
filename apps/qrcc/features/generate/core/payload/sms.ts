/**
 * SMS の内容の種類。番号の正規化と検証は `phone.ts`（`tel` と共有）。
 * 本文は自由な文字列で、空も許す。
 */
import type { Result } from '@qrcc/contract'
import { ok } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'
import type { PhoneParseError } from './phone.ts'
import { parsePhoneInput } from './phone.ts'

export type SmsError = PhoneParseError
export type SmsPayload = Extract<CodePayload, { readonly kind: 'sms' }>

export type SmsInput = {
  readonly number: string
  readonly body: string
}

export const buildSmsPayload = (input: SmsInput): Result<SmsPayload, SmsError> => {
  const number = parsePhoneInput(input.number)
  return number.ok ? ok({ kind: 'sms', number: number.value, body: input.body }) : number
}
