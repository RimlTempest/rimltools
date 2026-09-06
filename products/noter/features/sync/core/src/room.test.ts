import type { Role, UserId } from '@noter/contract'
import { MAX_MEMBERS, parseUserId } from '@noter/contract'
import { CLOSE_CODES, PERSIST_DELAY_MS, encodeIdentity } from '@noter/sync/contract'
import { describe, expect, test } from 'bun:test'
import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'
import { toArrayBuffer } from './bytes.ts'
import { INTERNAL_ROUTES } from './internal-routes.ts'
import { makeRoom } from './room.ts'
import type { FakeSockets, FakeStorage } from './tests/fakes.ts'
import { makeFakeSockets, makeFakeStorage } from './tests/fakes.ts'
import { encodeSyncUpdate } from './wire.ts'

const userId = (body: string): UserId => {
  const parsed = parseUserId(`usr_${body}`)
  if (!parsed.ok) throw new Error(`fixture is invalid: ${body}`)
  return parsed.value
}

const ADA = userId('0123456789abcdefghjkmnpq')
const GRACE = userId('zyxwvtsrqpnmkjhgfedcba98')

/**
 * `Upgrade` は forbidden header name なので、`new Request(url, { headers })` では
 * 落ちる実装がある（happy-dom）。生成後の `request.headers` に載せる。
 */
const withUpgrade = (request: Request): Request => {
  request.headers.set('Upgrade', 'websocket')
  return request
}

const upgradeRequest = (role: Role, actorId: UserId, name = 'Ada') =>
  withUpgrade(new Request('https://do/', { headers: encodeIdentity({ role, actorId, name }) }))

const setup = (over: { storage?: FakeStorage; sockets?: FakeSockets } = {}) => {
  const storage = over.storage ?? makeFakeStorage()
  const sockets = over.sockets ?? makeFakeSockets()
  const touched: number[] = []
  let clock = 1_000
  const room = makeRoom({
    storage,
    sockets,
    now: () => clock,
    touch: (updatedAt: number) => {
      touched.push(updatedAt)
      return Promise.resolve()
    },
  })
  return {
    storage,
    sockets,
    room,
    touched,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const updateFrom = (text: string) => {
  const source = new Y.Doc()
  source.getText('content').insert(0, text)
  return Y.encodeStateAsUpdate(source)
}

describe('makeRoom: init', () => {
  test('ping/pong の自動応答を仕込む（DO を起こさないため）', async () => {
    const scope = setup()
    await scope.room.init()
    expect(scope.sockets.autoResponse()).toEqual(['ping', 'pong'])
  })

  test('保存済みの state を復元する', async () => {
    const storage = makeFakeStorage()
    const first = setup({ storage })
    await first.room.init()
    await first.room.handleRequest(upgradeRequest('editor', ADA))
    const socket = first.sockets.open()[0]
    expect(socket).toBeDefined()
    if (socket === undefined) return
    await first.room.onMessage(socket, toArrayBuffer(encodeSyncUpdate(updateFrom('restored'))))
    await first.room.onClose(socket, 1000)

    // 同じ storage で新しい Room を起こす（hibernation 明けに相当）
    const second = setup({ storage })
    await second.room.init()
    const snapshot = await second.room.handleRequest(
      new Request(`https://do${INTERNAL_ROUTES.snapshot}`),
    )
    expect(await snapshot.text()).toBe('restored')
  })
})

describe('makeRoom: handleRequest', () => {
  test('Upgrade でも内部ルートでもなければ 404', async () => {
    const scope = setup()
    await scope.room.init()
    const response = await scope.room.handleRequest(new Request('https://do/anything'))
    expect(response.status).toBe(404)
  })

  test('身元が正しければ 101 を返し、step1 を送る', async () => {
    const scope = setup()
    await scope.room.init()
    const response = await scope.room.handleRequest(upgradeRequest('editor', ADA))
    expect(response.status).toBe(101)

    const socket = scope.sockets.open()[0]
    expect(socket).toBeDefined()
    if (socket === undefined) return
    const first = socket.sent()[0]
    expect(first).toBeDefined()
    if (first === undefined) return
    const decoder = decoding.createDecoder(first)
    expect(decoding.readVarUint(decoder)).toBe(0)
    expect(decoding.readVarUint(decoder)).toBe(0)
  })

  test('身元が不正なら 4400 で閉じる', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(withUpgrade(new Request('https://do/')))

    const socket = scope.sockets.open()[0]
    expect(socket?.closedWith()).toEqual({ code: CLOSE_CODES.badRequest, reason: 'bad_request' })
  })

  test(`${MAX_MEMBERS + 1} 人目は 4429 で閉じる`, async () => {
    const scope = setup()
    await scope.room.init()
    for (let index = 0; index < MAX_MEMBERS; index += 1) {
      // 接続数の判定は 1 本ずつ順に増えることが前提なので、並列にはできない
      // oxlint-disable-next-line eslint/no-await-in-loop
      await scope.room.handleRequest(upgradeRequest('editor', ADA))
    }
    await scope.room.handleRequest(upgradeRequest('editor', ADA))

    const sockets = scope.sockets.open()
    expect(sockets).toHaveLength(MAX_MEMBERS + 1)
    expect(sockets[MAX_MEMBERS]?.closedWith()).toEqual({
      code: CLOSE_CODES.limit,
      reason: 'limit',
    })
    expect(sockets[0]?.closedWith()).toBeNull()
  })

  test('後から入った人には既存参加者の awareness が届く', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    const first = scope.sockets.open()[0]
    if (first === undefined) throw new Error('no socket')
    await scope.room.onMessage(first, toArrayBuffer(awarenessMessage()))

    await scope.room.handleRequest(upgradeRequest('editor', GRACE, 'Grace'))
    const second = scope.sockets.open()[1]
    expect(second?.sent()).toHaveLength(2)
  })

  test('/snapshot は text/plain で本文を返す', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    const socket = scope.sockets.open()[0]
    if (socket === undefined) throw new Error('no socket')
    await scope.room.onMessage(socket, toArrayBuffer(encodeSyncUpdate(updateFrom('body text'))))

    const response = await scope.room.handleRequest(
      new Request(`https://do${INTERNAL_ROUTES.snapshot}`),
    )
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toBe('body text')
  })

  test('/kick は該当 actor のソケットだけを 4403 で閉じ、204 を返す', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    await scope.room.handleRequest(upgradeRequest('editor', GRACE, 'Grace'))

    const response = await scope.room.handleRequest(
      new Request(`https://do${INTERNAL_ROUTES.kick}`, {
        method: 'POST',
        body: JSON.stringify({ actorId: GRACE }),
      }),
    )
    expect(response.status).toBe(204)
    expect(scope.sockets.open()[0]?.closedWith()).toBeNull()
    expect(scope.sockets.open()[1]?.closedWith()).toEqual({
      code: CLOSE_CODES.forbidden,
      reason: 'forbidden',
    })
  })

  test('/kick の本文が壊れていたら 400', async () => {
    const scope = setup()
    await scope.room.init()
    const response = await scope.room.handleRequest(
      new Request(`https://do${INTERNAL_ROUTES.kick}`, { method: 'POST', body: 'not json' }),
    )
    expect(response.status).toBe(400)
  })
})

describe('makeRoom: onMessage / onClose', () => {
  test('更新は他のソケットへ中継され、alarm が張られる', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    await scope.room.handleRequest(upgradeRequest('viewer', GRACE, 'Grace'))
    const [sender, other] = [scope.sockets.open()[0], scope.sockets.open()[1]]
    if (sender === undefined || other === undefined) throw new Error('no socket')
    const before = other.sent().length

    await scope.room.onMessage(sender, toArrayBuffer(encodeSyncUpdate(updateFrom('hi'))))

    expect(other.sent().length).toBe(before + 1)
    expect(scope.storage.alarmAt()).toBe(1_000 + PERSIST_DELAY_MS)
  })

  test('身元の読めないソケットからのメッセージは 4400 で閉じる', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(withUpgrade(new Request('https://do/')))
    const socket = scope.sockets.open()[0]
    if (socket === undefined) throw new Error('no socket')

    await scope.room.onMessage(socket, toArrayBuffer(encodeSyncUpdate(updateFrom('hi'))))
    expect(socket.closedWith()?.code).toBe(CLOSE_CODES.badRequest)
  })

  test('最後のソケットが閉じたら alarm を待たずに保存する', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    const socket = scope.sockets.open()[0]
    if (socket === undefined) throw new Error('no socket')
    await scope.room.onMessage(socket, toArrayBuffer(encodeSyncUpdate(updateFrom('saved'))))
    expect(scope.touched).toHaveLength(0)

    await scope.room.onClose(socket, 1000)
    expect(scope.touched).toEqual([1_000])
  })

  test('切断すると他の参加者へ awareness の removal が配られる', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    await scope.room.handleRequest(upgradeRequest('editor', GRACE, 'Grace'))
    const [leaving, staying] = [scope.sockets.open()[0], scope.sockets.open()[1]]
    if (leaving === undefined || staying === undefined) throw new Error('no socket')
    await scope.room.onMessage(leaving, toArrayBuffer(awarenessMessage()))
    const before = staying.sent().length

    await scope.room.onClose(leaving, 1006)
    expect(staying.sent().length).toBe(before + 1)
    const last = staying.sent()[staying.sent().length - 1]
    if (last === undefined) throw new Error('no payload')
    const decoder = decoding.createDecoder(last)
    expect(decoding.readVarUint(decoder)).toBe(1)
  })

  test('alarm が来たら state が保存される', async () => {
    const scope = setup()
    await scope.room.init()
    await scope.room.handleRequest(upgradeRequest('editor', ADA))
    const socket = scope.sockets.open()[0]
    if (socket === undefined) throw new Error('no socket')
    await scope.room.onMessage(socket, toArrayBuffer(encodeSyncUpdate(updateFrom('alarmed'))))

    await scope.room.onAlarm()
    expect(scope.touched).toEqual([1_000])
  })
})

/** clientId 7 / clock 1 / state `{}` の awareness update をワイヤ形式で包んだもの。 */
const awarenessMessage = (): Uint8Array => {
  const body = new Uint8Array([1, 7, 1, 2, 123, 125])
  const message = new Uint8Array(body.byteLength + 2)
  message[0] = 1
  message[1] = body.byteLength
  message.set(body, 2)
  return message
}
