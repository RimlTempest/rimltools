import { describe, expect, test } from 'bun:test'

import { handle, type HandlerDeps } from './handler.ts'
import { DEFAULT_RETENTION } from './core/retention.ts'
import { createMemoryStore } from './memory-store.ts'

const READ_PASSWORD = 'read-secret-0123456789abcdef0123456789'
const WRITE_PASSWORD = 'write-secret-0123456789abcdef0123456789'
const creds = {
  read: { user: 'reader', password: READ_PASSWORD },
  write: { user: 'writer', password: WRITE_PASSWORD },
}
const READ = `Basic ${btoa(`reader:${READ_PASSWORD}`)}`
const WRITE = `Basic ${btoa(`writer:${WRITE_PASSWORD}`)}`
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
  const store = createMemoryStore()
  const deps: HandlerDeps = {
    store,
    now: () => clock,
    credentials: creds,
    lockTtlMs: 60_000,
    retention: DEFAULT_RETENTION,
    log: (entry) => logs.push(entry),
    ...overrides,
  }
  const call = (method: string, url: string, auth: string | null, body?: string) =>
    handle(
      new Request(url, {
        method,
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          ...(auth === null ? {} : { authorization: auth }),
        },
        ...(body === undefined ? {} : { body }),
      }),
      deps,
    )
  return { call, logs, store, advance: (ms: number) => (clock += ms) }
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

  test('auth failures are logged as tfstate_auth_failed without credentials', async () => {
    const { call, logs } = setup()
    await call('GET', PATH, `Basic ${btoa('writer:guess-guess-guess')}`)
    await call('LOCK', PATH, READ, lockBody('a'))
    const failures = logs.filter((l) => l['event'] === 'tfstate_auth_failed')
    expect(failures).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/states/rimltools-production',
        status: 401,
        result: 'unauthorized',
        ip: '203.0.113.7',
      }),
      expect.objectContaining({
        method: 'LOCK',
        path: '/states/rimltools-production',
        status: 403,
        result: 'forbidden',
        ip: '203.0.113.7',
      }),
    ])
    const text = JSON.stringify(logs)
    expect(text).not.toContain('guess-guess')
    expect(text).not.toContain(READ_PASSWORD)
    expect(text).not.toContain('Basic ')
  })

  test('successful requests are not logged as auth failures', async () => {
    const { call, logs } = setup()
    await call('GET', PATH, READ)
    expect(logs.some((l) => l['event'] === 'tfstate_auth_failed')).toBe(false)
  })

  test('logs never include the body or the credentials', async () => {
    const { call, logs } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))
    const text = JSON.stringify(logs)
    expect(text).not.toContain('cipher-1')
    expect(text).not.toContain(WRITE_PASSWORD)
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

  test('DELETE is 405 and leaves the state and its history intact', async () => {
    const { call, store } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    await call('POST', `${PATH}?ID=a`, WRITE, encrypted(1))
    await call('POST', `${PATH}?ID=a`, WRITE, encrypted(2))
    const res = await call('DELETE', `${PATH}?ID=a`, WRITE)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).not.toContain('DELETE')
    expect(await (await call('GET', PATH, READ)).text()).toBe(encrypted(2))
    const versions = await store.listVersions('/states/rimltools-production')
    expect(versions.ok && versions.value.map((v) => v.serial)).toEqual([2, 1])
  })
})

describe('retention', () => {
  const DAY = 24 * 60 * 60 * 1000
  const write = async (call: ReturnType<typeof setup>['call'], serial: number) =>
    (await call('POST', `${PATH}?ID=a`, WRITE, encrypted(serial))).status

  test('many rewrites within 7 days cannot push out history', async () => {
    const { call, store } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    for (const serial of Array.from({ length: 30 }, (_, i) => i + 1)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- 版は順に積む
      expect(await write(call, serial)).toBe(200)
    }
    const versions = await store.listVersions('/states/rimltools-production')
    expect(versions.ok && versions.value.length).toBe(30)
  })

  test('versions older than 7 days beyond the newest 20 are pruned', async () => {
    const { call, store, advance } = setup()
    await call('LOCK', PATH, WRITE, lockBody('a'))
    for (const serial of Array.from({ length: 25 }, (_, i) => i + 1)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- 版は順に積む
      expect(await write(call, serial)).toBe(200)
    }
    advance(8 * DAY)
    // ロックは期限切れなので取り直す
    await call('LOCK', PATH, WRITE, lockBody('a'))
    expect(await write(call, 26)).toBe(200)
    const versions = await store.listVersions('/states/rimltools-production')
    expect(versions.ok && versions.value.map((v) => v.serial)).toEqual(
      Array.from({ length: 20 }, (_, i) => 26 - i),
    )
  })

  test('refuses with 507 instead of pruning when the limit is reached, and logs it', async () => {
    const { call, logs, store } = setup({
      retention: { ...DEFAULT_RETENTION, maxVersions: 3 },
    })
    await call('LOCK', PATH, WRITE, lockBody('a'))
    expect(await write(call, 1)).toBe(200)
    expect(await write(call, 2)).toBe(200)
    expect(await write(call, 3)).toBe(200)
    const res = await call('POST', `${PATH}?ID=a`, WRITE, encrypted(4))
    expect(res.status).toBe(507)
    expect(await (await call('GET', PATH, READ)).text()).toBe(encrypted(3))
    const versions = await store.listVersions('/states/rimltools-production')
    expect(versions.ok && versions.value.map((v) => v.serial)).toEqual([3, 2, 1])
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'tfstate_retention_limit',
        reason: 'too-many-versions',
        path: '/states/rimltools-production',
      }),
    )
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
