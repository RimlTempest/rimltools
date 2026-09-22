import { describe, expect, test } from 'bun:test'

import { makeHandleLinkAccount } from './link-account.ts'

const FROM = 'usr_0123456789abcdefghjkmnpq'
const TO = 'usr_abcdefghjkmnpqrstvwxyz01'

describe('makeHandleLinkAccount', () => {
  test('promotes the guest to the new account', async () => {
    const calls: unknown[] = []
    const handle = makeHandleLinkAccount({
      subject: 'データ',
      promote: async (input) => {
        calls.push(input)
        return { ok: true, value: undefined }
      },
      reportFailure: () => {},
    })
    await handle({ anonymousUser: { user: { id: FROM } }, newUser: { user: { id: TO } } })
    expect(calls).toEqual([{ fromUserId: FROM, toUserId: TO }])
  })

  test('never throws: bad ids and failed promotions are reported, sign-in still succeeds', async () => {
    const failures: string[] = []
    const handle = makeHandleLinkAccount({
      subject: '文書',
      promote: async () => ({ ok: false, error: { kind: 'storage_unavailable' } }),
      reportFailure: (detail) => failures.push(detail),
    })
    await handle({ anonymousUser: { user: { id: 'bad' } }, newUser: { user: { id: TO } } })
    await handle({ anonymousUser: { user: { id: FROM } }, newUser: { user: { id: TO } } })
    expect(failures).toEqual([
      `移譲元/先の UserId を解釈できなかった: from=bad to=${TO}`,
      'ゲストの文書を移譲できなかった: storage_unavailable',
    ])
  })
})
