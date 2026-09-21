/**
 * 検証済み文字列（Branded Primitive）。
 *
 * 「URL を検証してから使う」ことを型で強制するためにある。
 * `renderUrlCode(url: HttpUrl)` は未検証の string を受け取れない。
 */
import type { Brand } from './brand.ts'
import { makeParser } from './brand.ts'

/** 前後の空白を除いて 1 文字以上ある文字列。 */
export type NonEmptyText = Brand<string, 'NonEmptyText'>
/** スキームが http/https の URL。`javascript:` などを弾く。 */
export type HttpUrl = Brand<string, 'HttpUrl'>
export type EmailAddress = Brand<string, 'EmailAddress'>
/** E.164 形式の電話番号。 */
export type PhoneNumber = Brand<string, 'PhoneNumber'>
/** `#rgb` / `#rrggbb` / `#rrggbbaa`（小文字）。 */
export type HexColor = Brand<string, 'HexColor'>

export type TextParseError = {
  readonly kind: 'invalid_text'
  readonly expected: string
}

const invalid = (expected: string) => (): TextParseError => ({ kind: 'invalid_text', expected })

const HTTP_SCHEMES = new Set(['http:', 'https:'])
const emailPattern = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const phonePattern = /^\+[1-9]\d{7,14}$/
const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/

const isNonEmptyText = (value: string): value is NonEmptyText => value.trim().length > 0

const isHttpUrl = (value: string): value is HttpUrl => {
  if (!URL.canParse(value)) return false
  return HTTP_SCHEMES.has(new URL(value).protocol)
}

const isEmailAddress = (value: string): value is EmailAddress => emailPattern.test(value)
const isPhoneNumber = (value: string): value is PhoneNumber => phonePattern.test(value)
const isHexColor = (value: string): value is HexColor => hexColorPattern.test(value)

export const parseNonEmptyText = makeParser(
  isNonEmptyText,
  invalid('at least one non-whitespace character'),
)
export const parseHttpUrl = makeParser(isHttpUrl, invalid('an absolute http(s) URL'))
export const parseEmailAddress = makeParser(isEmailAddress, invalid('an email address'))
export const parsePhoneNumber = makeParser(
  isPhoneNumber,
  invalid('an E.164 phone number, e.g. +819012345678'),
)
export const parseHexColor = makeParser(
  isHexColor,
  invalid('#rgb, #rrggbb or #rrggbbaa in lowercase'),
)
