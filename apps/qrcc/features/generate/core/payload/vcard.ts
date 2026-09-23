/**
 * 名刺の内容の種類。
 *
 * 氏名だけが必須。組織・電話・メール・URL は空文字なら「未入力」として
 * `undefined` に落とす。符号化（MeCard）は Rust 側
 * （`features/generate/engine/src/payload.rs`）が持つ。
 */
import type { Result } from '@qrcc/contract'
import { err, ok, parseEmailAddress, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type { CodePayload } from '../../contract/payload.ts'
import { parsePhoneInput } from './phone.ts'

export type VCardError =
  | { readonly kind: 'invalid_name' }
  | { readonly kind: 'invalid_tel' }
  | { readonly kind: 'invalid_email' }
  | { readonly kind: 'invalid_url' }

export type VCardPayload = Extract<CodePayload, { readonly kind: 'vcard' }>

export type VCardInput = {
  readonly name: string
  readonly organization: string
  readonly tel: string
  readonly email: string
  readonly url: string
}

export const buildVCardPayload = (input: VCardInput): Result<VCardPayload, VCardError> => {
  const name = parseNonEmptyText(input.name)
  if (!name.ok) return err({ kind: 'invalid_name' })

  const tel = input.tel.trim().length === 0 ? undefined : parsePhoneInput(input.tel)
  if (tel !== undefined && !tel.ok) return err({ kind: 'invalid_tel' })

  const email = input.email.trim().length === 0 ? undefined : parseEmailAddress(input.email)
  if (email !== undefined && !email.ok) return err({ kind: 'invalid_email' })

  const url = input.url.trim().length === 0 ? undefined : parseHttpUrl(input.url)
  if (url !== undefined && !url.ok) return err({ kind: 'invalid_url' })

  return ok({
    kind: 'vcard',
    card: {
      name: name.value,
      organization: input.organization,
      tel: tel?.ok === true ? tel.value : undefined,
      email: email?.ok === true ? email.value : undefined,
      url: url?.ok === true ? url.value : undefined,
    },
  })
}
