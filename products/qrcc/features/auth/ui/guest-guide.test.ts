import { describe, expect, test } from 'bun:test'
import { GUEST_SESSION_DAYS as SERVER_DAYS } from '../server/auth-options.ts'
import { GUEST_SESSION_DAYS as UI_DAYS } from './guest-guide.ts'

describe('ゲストの有効期限', () => {
  test('画面の説明とサーバの設定が同じ値である', () => {
    // 画面だけ直すと「30 日と書いてあるのに 7 日で消える」が起きる
    expect(UI_DAYS).toBe(SERVER_DAYS)
  })
})
