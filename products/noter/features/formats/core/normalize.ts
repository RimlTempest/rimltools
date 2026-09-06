/**
 * ライブラリが返す値を `JsonValue` に正規化する。
 *
 * yaml は Date や undefined を、smol-toml は `TomlDate`（Date の派生）や
 * bigint を返しうる。ここで JSON に書ける形へ寄せておくことで、
 * 変換（yaml → toml など）とツリープレビューが 1 つの型だけを見れば済む。
 *
 * 失敗は値で返す（ドメイン層では throw しない）。
 */
import type { Result } from '@noter/contract'
import { err, ok } from '@noter/contract'
import type { JsonValue } from '../contract/json-value.ts'

export type NormalizeError = {
  readonly kind: 'unsupported_value'
  /** 値の場所（`$.server.port` / `$[1]`）。診断メッセージにそのまま載せる。 */
  readonly path: string
  /** 人が読める型名。 */
  readonly typeName: string
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER)

export const toJsonValue = (input: unknown, path = '$'): Result<JsonValue, NormalizeError> => {
  if (input === null) return ok(null)
  if (typeof input === 'boolean' || typeof input === 'string') return ok(input)
  if (typeof input === 'number') {
    return Number.isFinite(input)
      ? ok(input)
      : err({ kind: 'unsupported_value', path, typeName: '有限でない数値' })
  }
  if (typeof input === 'bigint') {
    // 安全整数を超える整数は number にすると桁が落ちる。文字列で残す。
    return input <= MAX_SAFE && input >= MIN_SAFE ? ok(Number(input)) : ok(input.toString())
  }
  if (input instanceof Date) return ok(input.toISOString())
  if (Array.isArray(input)) {
    const items: JsonValue[] = []
    for (const [index, item] of input.entries()) {
      const normalized = toJsonValue(item, `${path}[${index}]`)
      if (!normalized.ok) return normalized
      items.push(normalized.value)
    }
    return ok(items)
  }
  if (typeof input === 'object') {
    const entries: Record<string, JsonValue> = {}
    for (const [key, value] of Object.entries(input)) {
      // JSON に undefined は書けない。キーごと落とす（JSON.stringify と同じ）。
      if (value === undefined) continue
      const normalized = toJsonValue(value, `${path}.${key}`)
      if (!normalized.ok) return normalized
      entries[key] = normalized.value
    }
    return ok(entries)
  }
  return err({ kind: 'unsupported_value', path, typeName: typeof input })
}
