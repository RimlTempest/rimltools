import { afterEach, describe, expect, test } from 'bun:test'
import { stashInitialBody, takeInitialBody } from './initial-body.ts'

afterEach(() => {
  globalThis.sessionStorage.clear()
})

describe('初期本文の受け渡し', () => {
  test('預けた本文を取り出せる', () => {
    stashInitialBody('doc_1', '{\n  "a": 1\n}\n')
    expect(takeInitialBody('doc_1')).toBe('{\n  "a": 1\n}\n')
  })

  test('取り出したら消える（もう一度開いても入らない）', () => {
    stashInitialBody('doc_1', 'a: 1\n')
    takeInitialBody('doc_1')
    expect(takeInitialBody('doc_1')).toBeUndefined()
  })

  test('別の文書の本文は取り出せない', () => {
    stashInitialBody('doc_1', 'a: 1\n')
    expect(takeInitialBody('doc_2')).toBeUndefined()
  })

  test('預けていなければ undefined', () => {
    expect(takeInitialBody('doc_3')).toBeUndefined()
  })
})
