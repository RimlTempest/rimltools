/**
 * メールの内容の種類。
 *
 * 宛先は `EmailAddress` で検証する（`@qrcc/contract`）。件名・本文は
 * `mailto:` の `subject` / `body` にそのまま乗るので、空文字も許す。
 */
import type { Result } from '@qrcc/contract'
import { err, ok, parseEmailAddress } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'

export type EmailError = { readonly kind: 'invalid_to' }
export type EmailPayload = Extract<CodePayload, { readonly kind: 'email' }>

export type EmailInput = {
  readonly to: string
  readonly subject: string
  readonly body: string
}

export const buildEmailPayload = (input: EmailInput): Result<EmailPayload, EmailError> => {
  const to = parseEmailAddress(input.to)
  return to.ok
    ? ok({ kind: 'email', to: to.value, subject: input.subject, body: input.body })
    : err({ kind: 'invalid_to' })
}
