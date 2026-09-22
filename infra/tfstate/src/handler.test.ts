import { describe, expect, test } from 'bun:test'

import { handle, type HandlerDeps } from './handler.ts'
import { createMemoryStore } from './memory-store.ts'

const creds = {
  read: { user: 'reader', password: 'read-secret-0123456789' },
  write: { user: 'writer', password: 'write-secret-0123456789' },
}
const READ = `Basic ${btoa('reader:read-secret-0123456789')}`
const WRITE = `Basic ${btoa('writer:write-secret-0123456789')}`
const PATH = 'https://tfstate.example.com/states/rimltools-production'

const encrypted = (serial: number) =>
  JSON.stringify({
    serial,
    lineage: 'lin',
    meta: { 'key_provider.pbkdf2.main': 'eyJ...' },
    encrypted_data: `cipher-${serial}`,
    encryption_version: 'v0',
  })

const lockBody = (id: string) =>
  JSON.stringify({ ID: id, Operation: 'OperationTypeApply', Who: 'ci', Version: '1.12.6' })

const setup = (overrides: Partial<HandlerDeps> = {}) => {
  let clock = 1_000_000
  const logs: Record<string, unknown>[] = []
  const deps: HandlerDeps = {
    store: createMemoryStore(),
    now: () => clock,
    credentials: creds,
    lockTtlMs: 60_000,
    log: (entry) => logs.push(entry),
    ...overrides,
  }
  const call = (method: string, url: string, auth: string | null, body?: string) =>
    handle(
      new Request(url, {
        method,
        headers: auth === null ? {} : { authorization: auth },
        ...(body === undefined ? {} : { body }),
      }),
      deps,
    )
  return { call, logs, advance: (ms: number) => (clock += ms) }
}

describe('auth and routing', () => {
  test('401 without credentials, with a Basic challenge', async () => {
    const { call } = setup()
    const res = await call('GET', PATH, null)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Basic')
  })

  test('403 when read credentials try to write', async () => {
    const { call } = setup()
    expect((await call('LOCK', PATH, READ, lockBody('a'))).status).toBe(403)
    expect((await call('POST', `${PATH}?ID=a`, READ, encrypted(1))).status).toBe(403)
  })

  test('404 for paths outside the allow list, even with valid credentials', async () => {
    const { call } = setup()
    expect((await call('GET', 'https://tfstate.example.com/states/other', WRITE)).status).toBe(404)
    expect((await call('GET', 'https://tfstate.example.com/', WRITE)).status).toBe(404)
  })

  test('405 for unknown methods', async () => {
    const { call } = setup()
    expect((await call('PUT', PATH, WRITE, encrypted(1))).status).toBe(405)
  })

  test('logs never include the body or the credentials', async () => {
    const { call, logs } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))
    const text = JSON.stringify(logs)
    expect(text).not.toContain('cipher-1')
    expect(text).not.toContain('write-secret')
    expect(logs.at(-1)).toMatchObject({
      method: 'POST',
      path: '/states/rimltools-production',
      status: 200,
    })
  })
})

describe('state', () => {
  test('GET before any write is 204 (no state yet)', async () => {
    const { call } = setup()
    expect((await call('GET', PATH, READ)).status).toBe(204)
  })

  test('write under a lock, then read it back with read credentials', async () => {
    const { call } = setup()
    expect((await call('LOCK', PATH, WRITE, lockBody('a'))).status).toBe(200)
    expect((await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))).status).toBe(200)
    const res = await call('GET', PATH, READ)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(encrypted(1))
  })

  test('rejects writes without the current lock ID', async () => {
    const { call } = setup()
    expect((await call('POST', PATH, WRITE, encrypted(1))).status).toBe(409)
    await call('LOCK', PATH, WRITE, lockBody('a'))
    expect((await call('POST', `${PATH}?ID=b`, WRITE, encrypted(1))).status).toBe(409)
  })

  test('rejects plaintext state with 422', async () => {
    const { call } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    const plain = JSON.stringify({ version: 4, serial: 1, lineage: 'x', resources: [] })
    const res = await call('POST', `${PATH}?ID=a`, WRITE, plain)
    expect(res.status).toBe(422)
    expect((await call('GET', PATH, READ)).status).toBe(204)
  })

  test('rejects state larger than the limit with 413', async () => {
    const { call } = setup({ maxStateBytes: 100 })
    await call('LOCK', PATH, WRITE, lockBody('a'))
    expect((await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))).status).toBe(413)
  })

  test('DELETE removes the state', async () => {
    const { call } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))
    expect((await call('DELETE', `${PATH}?ID=a`, WRITE)).status).toBe(200)
    expect((await call('GET', PATH, READ)).status).toBe(204)
  })
})

describe('locks', () => {
  test('a second LOCK gets 423 and the holder info', async () => {
    const { call } = setup()
    expect((await call('LOCK', PATH, WRITE, lockBody('a'))).status).toBe(200)
    const res = await call('LOCK', PATH, WRITE, lockBody('b'))
    expect(res.status).toBe(423)
    expect(await res.json()).toMatchObject({ ID: 'a' })
  })

  test('UNLOCK with the holder ID frees the lock; with another ID it is 423', async () => {
    const { call } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    expect((await call('UNLOCK', PATH, WRITE, lockBody('b'))).status).toBe(423)
    expect((await call('UNLOCK', PATH, WRITE, lockBody('a'))).status).toBe(200)
    expect((await call('LOCK', PATH, WRITE, lockBody('b'))).status).toBe(200)
  })

  test('UNLOCK when nothing is locked is 200 (idempotent)', async () => {
    const { call } = setup()
    expect((await call('UNLOCK', PATH, WRITE, lockBody('a'))).status).toBe(200)
  })

  test('an expired lock can be taken over', async () => {
    const { call, advance } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    advance(60_001)
    expect((await call('LOCK', PATH, WRITE, lockBody('b'))).status).toBe(200)
  })

  test('LOCK with a malformed body is 400', async () => {
    const { call } = setup()
    expect((await call('LOCK', PATH, WRITE, '{}')).status).toBe(400)
  })
})
