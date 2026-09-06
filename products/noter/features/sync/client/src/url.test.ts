import { describe, expect, test } from 'bun:test'
import { toWebSocketOrigin } from './url.ts'

describe('toWebSocketOrigin', () => {
  test('https は wss になる', () => {
    expect(toWebSocketOrigin('https://noter.riml4i.com')).toBe('wss://noter.riml4i.com/ws')
  })

  test('http は ws になる（ローカル開発）', () => {
    expect(toWebSocketOrigin('http://localhost:5173')).toBe('ws://localhost:5173/ws')
  })

  test('末尾にスラッシュを残さない（roomname と連結されるため）', () => {
    expect(toWebSocketOrigin('https://noter.riml4i.com/')).toBe('wss://noter.riml4i.com/ws')
  })

  test('パス・クエリ・フラグメントは落とす', () => {
    expect(toWebSocketOrigin('https://noter.riml4i.com/d/doc_x?a=1#b')).toBe(
      'wss://noter.riml4i.com/ws',
    )
  })
})
