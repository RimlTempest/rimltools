import { expect, test } from 'bun:test'

import { GUEST_SESSION_DAYS as SERVER_DAYS } from '../server/auth-options.ts'
import { GUEST_SESSION_DAYS } from './guest-guide.ts'

// UI はサーバ側モジュールを import しないので、同じ値を別に持つ。ずれないこと
test('the guest session length shown in the UI matches the server setting', () => {
  expect(GUEST_SESSION_DAYS).toBe(SERVER_DAYS)
})
