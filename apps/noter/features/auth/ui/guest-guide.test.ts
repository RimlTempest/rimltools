import { describe, expect, test } from 'bun:test'
import { GUEST_SESSION_DAYS as SERVER_DAYS } from '../server/auth-options.ts'
import { GUEST_SESSION_DAYS as UI_DAYS } from './guest-guide.ts'

describe('ゲストの有効期限', () => {
  test('画面の説明とサーバ設定がずれていない（ADR-0010: 30 日）', () => {
    expect(UI_DAYS).toBe(SERVER_DAYS)
    expect(UI_DAYS).toBe(30)
  })
})
