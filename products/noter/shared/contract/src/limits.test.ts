import { describe, expect, test } from 'bun:test'
import {
  MAX_DISPLAY_NAME,
  MAX_DOCUMENTS_PER_USER,
  MAX_DOCUMENT_BYTES,
  MAX_MEMBERS,
  MAX_TITLE_LENGTH,
  MAX_WS_MESSAGE_BYTES,
  SHARE_LINK_MAX_AGE_MS,
} from './limits.ts'

describe('上限', () => {
  test('docs/domain-model.md の値と一致する', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(1_048_576)
    expect(MAX_TITLE_LENGTH).toBe(120)
    expect(MAX_DISPLAY_NAME).toBe(32)
    expect(MAX_WS_MESSAGE_BYTES).toBe(262_144)
    expect(MAX_MEMBERS).toBe(50)
    expect(MAX_DOCUMENTS_PER_USER).toBe(200)
  })

  /** 1 メッセージが文書全体を超えられてしまうと、分割送信の前提が崩れる。 */
  test('WS メッセージ上限は文書上限より小さい', () => {
    expect(MAX_WS_MESSAGE_BYTES).toBeLessThan(MAX_DOCUMENT_BYTES)
  })

  test('共有リンクの既定有効期限は 90 日', () => {
    expect(SHARE_LINK_MAX_AGE_MS).toBe(90 * 24 * 60 * 60 * 1000)
  })
})
