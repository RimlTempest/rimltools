import { describe, expect, test } from 'bun:test'
import { collectResults, err, flatMapResult, isErr, isOk, mapResult, ok } from './result.ts'

const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err('odd' as const))

describe('Result', () => {
  test('ok は成功として判定される', () => {
    const result = ok(1)
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
  })

  test('mapResult は成功時のみ関数を適用する', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6))
    expect(mapResult(err('boom'), (n: number) => n * 3)).toEqual(err('boom'))
  })

  test('flatMapResult は失敗を短絡する', () => {
    expect(flatMapResult(ok(4), half)).toEqual(ok(2))
    expect(flatMapResult(ok(3), half)).toEqual(err('odd'))
    expect(flatMapResult(err('upstream' as const), half)).toEqual(err('upstream'))
  })

  test('collectResults は最初の失敗を返す', () => {
    expect(collectResults([ok(1), ok(2)])).toEqual(ok([1, 2]))
    expect(collectResults([ok(1), err('bad'), err('worse')])).toEqual(err('bad'))
  })

  test('collectResults は空配列で空の成功を返す', () => {
    expect(collectResults([])).toEqual(ok([]))
  })
})
