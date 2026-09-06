/**
 * yaml ⇄ json ⇄ toml の相互変換。
 *
 * どれも `JsonValue` を経由するので、変換は「読む」→「書く」の 2 段だけ。
 * TOML だけは表現力が狭い（トップレベルは表、null が無い）ので、
 * **書き出す前に**理由の分かる形で弾く。
 */
import type { Result } from '@noter/contract'
import { err } from '@noter/contract'
import type { DataDocumentKind } from '../contract/data-kind.ts'
import type { Diagnostic } from '../contract/diagnostic.ts'
import type { JsonValue } from '../contract/json-value.ts'
import { stringifyData } from './format.ts'
import { parseDocument } from './parse.ts'

export type ConvertError =
  /** 変換元が読めなかった。 */
  | { readonly reason: 'parse'; readonly diagnostics: readonly Diagnostic[] }
  /** TOML のトップレベルは表（オブジェクト）でなければならない。 */
  | { readonly reason: 'not_object' }
  /** TOML に null は無い。落ちる値の場所を示す。 */
  | { readonly reason: 'null_value'; readonly path: string }
  /** 想定外の書き出し失敗（ライブラリ側の制限）。 */
  | { readonly reason: 'stringify'; readonly diagnostics: readonly Diagnostic[] }

export const convertDocument = (
  from: DataDocumentKind,
  to: DataDocumentKind,
  text: string,
): Result<string, ConvertError> => {
  const parsed = parseDocument(from, text)
  if (!parsed.ok) return err({ reason: 'parse', diagnostics: parsed.error })
  if (parsed.value.kind !== 'data') return err({ reason: 'parse', diagnostics: [] })
  const value = parsed.value.value
  if (to === 'toml') {
    const rejection = rejectForToml(value)
    if (rejection !== undefined) return err(rejection)
  }
  const written = stringifyData(to, value)
  return written.ok ? written : err({ reason: 'stringify', diagnostics: written.error })
}

/** TOML に落とせない理由を探す。落とせるなら undefined。 */
const rejectForToml = (value: JsonValue): ConvertError | undefined => {
  if (!isJsonObject(value)) return { reason: 'not_object' }
  return findNull(value, '$')
}

const findNull = (value: JsonValue, path: string): ConvertError | undefined => {
  if (value === null) return { reason: 'null_value', path }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findNull(item, `${path}[${index}]`)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (isJsonObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = findNull(item, `${path}.${key}`)
      if (found !== undefined) return found
    }
  }
  return undefined
}

const isJsonObject = (value: JsonValue): value is { readonly [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
