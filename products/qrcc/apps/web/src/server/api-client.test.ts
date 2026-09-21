import { describe, expect, test } from 'bun:test'
import { RPC_HEADER, parseUserId } from '@qrcc/contract'
import { ok } from '@qrcc/contract'
import { makeApiClient } from './api-client.ts'

/** テスト用の素通しデコーダ。実際の呼び出し側は形を検証する。 */
const anyValue = (value: unknown) => ok(value)

const ACTOR = parseUserId('usr_0123456789abcdefghjkmnpq')
const actorId = ACTOR.ok ? ACTOR.value : undefined

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const recordingClient = (respond: (request: Request) => Response) => {
  const sent: Request[] = []
  const client = makeApiClient({
    fetch: async (request) => {
      sent.push(request)
      return respond(request)
    },
    newRequestId: () => 'req-1',
  })
  return { client, sent }
}

describe('service binding 経由の RPC 呼び出し', () => {
  test('成功した封筒の中身を取り出す', async () => {
    const { client } = recordingClient(() => jsonResponse({ ok: true, value: { status: 'ok' } }))
    const result = await client.call('health', {}, anyValue)
    expect(result).toEqual({ ok: true, value: { ok: true, value: { status: 'ok' } } })
  })

  test('業務エラーは内側の Result になる（呼び出し自体は成功）', async () => {
    const { client } = recordingClient(() =>
      jsonResponse({ ok: false, error: { kind: 'unauthorized' } }),
    )
    const result = await client.call('whoami', {}, anyValue)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ ok: false, error: { kind: 'unauthorized' } })
  })

  test('200 以外は転送失敗として、状態コードを添えて返す', async () => {
    const { client } = recordingClient(() => new Response('too large', { status: 413 }))
    const result = await client.call('render', {}, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('transport')
      if (result.error.kind === 'transport') expect(result.error.status).toBe(413)
    }
  })

  test('JSON でない本文は転送失敗にする（業務エラーと混同しない）', async () => {
    const { client } = recordingClient(() => new Response('<html>', { status: 200 }))
    const result = await client.call('health', {}, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('malformed_envelope')
  })

  test('封筒の形が違えば転送失敗にする', async () => {
    const { client } = recordingClient(() => jsonResponse({ status: 'ok' }))
    const result = await client.call('health', {}, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('malformed_envelope')
  })

  test('POST /rpc/<method> に送る', async () => {
    const { client, sent } = recordingClient(() => jsonResponse({ ok: true, value: null }))
    await client.call('codes.list', {}, anyValue)
    expect(sent[0]?.method).toBe('POST')
    expect(new URL(sent[0]?.url ?? '').pathname).toBe('/rpc/codes.list')
  })

  test('呼び出し元があるときだけ actor ヘッダを付ける', async () => {
    const { client, sent } = recordingClient(() => jsonResponse({ ok: true, value: null }))
    await client.call('health', {}, anyValue)
    expect(sent[0]?.headers.get(RPC_HEADER.actor)).toBeNull()

    if (actorId !== undefined) {
      await client.call('whoami', {}, anyValue, { actor: actorId })
      expect(sent[1]?.headers.get(RPC_HEADER.actor)).toBe(actorId)
    }
  })

  test('相関用のリクエスト ID を必ず付ける', async () => {
    const { client, sent } = recordingClient(() => jsonResponse({ ok: true, value: null }))
    await client.call('health', {}, anyValue)
    expect(sent[0]?.headers.get(RPC_HEADER.requestId)).toBe('req-1')
  })

  test('冪等キーは指定したときだけ付く', async () => {
    const { client, sent } = recordingClient(() => jsonResponse({ ok: true, value: null }))
    await client.call('codes.create', {}, anyValue, { idempotencyKey: 'key-1' })
    expect(sent[0]?.headers.get(RPC_HEADER.idempotencyKey)).toBe('key-1')
  })

  test('fetch が例外を投げても Result で返す（呼び出し側に throw を漏らさない）', async () => {
    const client = makeApiClient({
      fetch: () => Promise.reject(new Error('binding down')),
      newRequestId: () => 'req-1',
    })
    const result = await client.call('health', {}, anyValue)
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === 'transport') {
      expect(result.error.detail).toContain('binding down')
    }
  })
})
