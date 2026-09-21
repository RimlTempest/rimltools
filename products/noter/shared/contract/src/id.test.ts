import { describe, expect, test } from 'bun:test'
import type { IdParseError, RandomBytes } from './id.ts'
import type { Result } from '@rimltools/contract'
import { isErr, isOk } from '@rimltools/contract'
import {
  newDocumentId,
  newShareToken,
  newUserId,
  parseDocumentId,
  parseShareToken,
  parseUserId,
} from './id.ts'

/** テスト用の決定的な乱数源。実装は乱数を引数で受け取るので固定できる。 */
const fixedBytes = (fill: number) => (length: number) => new Uint8Array(length).fill(fill)

describe('ID のパース', () => {
  test('正しい形式の DocumentId を受け付ける', () => {
    expect(isOk(parseDocumentId('doc_0123456789abcdefghjkmnpq'))).toBe(true)
  })

  test('接頭辞が違うものを拒否する', () => {
    expect(isErr(parseDocumentId('usr_0123456789abcdefghjkmnpq'))).toBe(true)
  })

  test('長さが足りないものを拒否する', () => {
    expect(isErr(parseDocumentId('doc_0123'))).toBe(true)
  })

  test('base32 の文字集合外（i, l, o, u, 大文字）を拒否する', () => {
    for (const bad of [
      'doc_i123456789abcdefghjkmnp',
      'doc_l123456789abcdefghjkmnp',
      'doc_o123456789abcdefghjkmnp',
      'doc_u123456789abcdefghjkmnp',
      'doc_A123456789abcdefghjkmnp',
    ]) {
      expect(isErr(parseDocumentId(bad))).toBe(true)
    }
  })

  test('エラーは何を期待したかを持つ', () => {
    const parsed = parseDocumentId('nope')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('invalid_id')
      expect(parsed.error.expected).toContain('doc_')
    }
  })

  test('UserId と DocumentId は取り違えられない（接頭辞で弾く）', () => {
    expect(isErr(parseUserId('doc_0123456789abcdefghjkmnpq'))).toBe(true)
  })

  test('ShareToken は shr_ 接頭辞を要求する', () => {
    expect(isOk(parseShareToken('shr_0123456789abcdefghjkmnpq'))).toBe(true)
    expect(isErr(parseShareToken('0123456789abcdefghjkmnpq'))).toBe(true)
    expect(isErr(parseShareToken('abc'))).toBe(true)
  })
})

describe('ID の発行', () => {
  /** ブランドが異なる ID を同じ配列に混ぜると型が壊れるので、対で受け取る。 */
  const expectRoundTrip = <T extends string>(
    issue: (random: RandomBytes) => Result<T, IdParseError>,
    parse: (value: string) => Result<T, IdParseError>,
  ) => {
    const issued = issue(fixedBytes(0))
    expect(isOk(issued)).toBe(true)
    if (issued.ok) expect(isOk(parse(issued.value))).toBe(true)
  }

  test('発行した DocumentId は DocumentId のパーサを通る', () => {
    expectRoundTrip(newDocumentId, parseDocumentId)
  })

  test('発行した UserId は UserId のパーサを通る', () => {
    expectRoundTrip(newUserId, parseUserId)
  })

  test('発行した ShareToken は ShareToken のパーサを通る', () => {
    expectRoundTrip(newShareToken, parseShareToken)
  })

  test('本体は 24 文字（= 120 bit）', () => {
    const issued = newShareToken(fixedBytes(3))
    expect(issued.ok && issued.value.slice('shr_'.length).length === 24).toBe(true)
  })

  test('乱数が違えば ID も違う', () => {
    const a = newDocumentId(fixedBytes(0))
    const b = newDocumentId(fixedBytes(255))
    expect(a.ok && b.ok && a.value !== b.value).toBe(true)
  })

  test('同じ乱数なら同じ ID（決定的）', () => {
    const a = newDocumentId(fixedBytes(7))
    const b = newDocumentId(fixedBytes(7))
    expect(a.ok && b.ok && a.value === b.value).toBe(true)
  })
})
