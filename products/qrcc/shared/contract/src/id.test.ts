import { describe, expect, test } from 'bun:test'
import type { IdParseError, RandomBytes } from './id.ts'
import type { Result } from './result.ts'
import { isErr, isOk } from './result.ts'
import {
  newCodeId,
  newFolderId,
  newShareToken,
  newUserId,
  parseCodeId,
  parseShareToken,
  parseSpecHash,
  parseUserId,
} from './id.ts'

/** テスト用の決定的な乱数源。実装は乱数を引数で受け取るので固定できる。 */
const fixedBytes = (fill: number) => (length: number) => new Uint8Array(length).fill(fill)

describe('ID のパース', () => {
  test('正しい形式の CodeId を受け付ける', () => {
    const parsed = parseCodeId('cd_0123456789abcdefghjkmnpq')
    expect(isOk(parsed)).toBe(true)
  })

  test('接頭辞が違うものを拒否する', () => {
    const parsed = parseCodeId('usr_0123456789abcdefghjkmnpq')
    expect(isErr(parsed)).toBe(true)
  })

  test('長さが足りないものを拒否する', () => {
    expect(isErr(parseCodeId('cd_0123'))).toBe(true)
  })

  test('base32 の文字集合外（i, l, o, u, 大文字）を拒否する', () => {
    for (const bad of [
      'cd_i123456789abcdefghjkmnp',
      'cd_L123456789abcdefghjkmnp',
      'cd_O123456789abcdefghjkmnp',
      'cd_U123456789abcdefghjkmnp',
      'cd_A123456789abcdefghjkmnp',
    ]) {
      expect(isErr(parseCodeId(bad))).toBe(true)
    }
  })

  test('エラーは何を期待したかを持つ', () => {
    const parsed = parseCodeId('nope')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('invalid_id')
      expect(parsed.error.expected).toContain('cd_')
    }
  })

  test('UserId と CodeId は取り違えられない（接頭辞で弾く）', () => {
    expect(isErr(parseUserId('cd_0123456789abcdefghjkmnpq'))).toBe(true)
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

  test('発行した CodeId は CodeId のパーサを通る', () => {
    expectRoundTrip(newCodeId, parseCodeId)
  })

  test('発行した UserId は UserId のパーサを通る', () => {
    expectRoundTrip(newUserId, parseUserId)
  })

  test('乱数が違えば ID も違う', () => {
    const a = newCodeId(fixedBytes(0))
    const b = newCodeId(fixedBytes(255))
    expect(a.ok && b.ok && a.value !== b.value).toBe(true)
  })

  test('同じ乱数なら同じ ID（決定的）', () => {
    const a = newCodeId(fixedBytes(7))
    const b = newCodeId(fixedBytes(7))
    expect(a.ok && b.ok && a.value === b.value).toBe(true)
  })

  test('FolderId は fld_ 接頭辞を持つ', () => {
    const issued = newFolderId(fixedBytes(1))
    expect(issued.ok && issued.value.startsWith('fld_')).toBe(true)
  })
})

describe('ShareToken', () => {
  test('32 文字の base32 を受け付け、接頭辞は持たない', () => {
    const issued = newShareToken(fixedBytes(3))
    expect(issued.ok && issued.value.length === 32).toBe(true)
    if (issued.ok) expect(isOk(parseShareToken(issued.value))).toBe(true)
  })

  test('短いトークンを拒否する', () => {
    expect(isErr(parseShareToken('abc'))).toBe(true)
  })
})

describe('SpecHash', () => {
  test('64 文字の小文字 16 進を受け付ける', () => {
    expect(isOk(parseSpecHash('a'.repeat(64)))).toBe(true)
  })

  test('大文字と長さ違いを拒否する', () => {
    expect(isErr(parseSpecHash('A'.repeat(64)))).toBe(true)
    expect(isErr(parseSpecHash('a'.repeat(63)))).toBe(true)
  })
})
