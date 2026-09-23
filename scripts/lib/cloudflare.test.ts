import { describe, expect, test } from 'bun:test'

import { createCloudflare, type Fetch } from './cloudflare.ts'

const TOKEN = 'cf-secret-token-value-0123456789'

type Call = { url: string; init: RequestInit }

const fake = (reply: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = []
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init })
    return reply({ url, init })
  }
  return { cf: createCloudflare({ apiToken: TOKEN, fetch }), calls }
}

const failing: Fetch = async () => Promise.reject(new Error('socket hang up'))

describe('createCloudflare', () => {
  test('rest calls the v4 API with a bearer token and a JSON body', async () => {
    const { cf, calls } = fake(() => Response.json({ success: true, result: [1] }))
    const result = await cf.rest('POST', '/accounts/a/workers/x', { a: 1 })
    expect(result).toEqual({ ok: true, value: { success: true, result: [1] } })
    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/accounts/a/workers/x')
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]?.init.body).toBe('{"a":1}')
  })

  test('rest sends no body when none is given', async () => {
    const { cf, calls } = fake(() => Response.json({}))
    await cf.rest('GET', '/x')
    expect(calls[0]?.init.body).toBeUndefined()
  })

  test('graphql posts the query and variables to /graphql', async () => {
    const { cf, calls } = fake(() => Response.json({ data: { ok: 1 } }))
    const result = await cf.graphql('query Q { x }', { accountTag: 'acc' })
    expect(result).toEqual({ ok: true, value: { data: { ok: 1 } } })
    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/graphql')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe('{"query":"query Q { x }","variables":{"accountTag":"acc"}}')
  })

  test('a non-2xx reply is an error that carries the status and the body', async () => {
    const { cf } = fake(() => Response.json({ errors: ['nope'] }, { status: 403 }))
    const result = await cf.graphql('q', {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('403')
    expect(result.error).toContain('nope')
  })

  test('a reply that is not JSON is an error', async () => {
    const { cf } = fake(() => new Response('<html>bad gateway</html>', { status: 200 }))
    const result = await cf.rest('GET', '/x')
    expect(result.ok).toBe(false)
  })

  test('a network failure is an error, not an exception', async () => {
    const cf = createCloudflare({ apiToken: TOKEN, fetch: failing })
    const result = await cf.graphql('q', {})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('socket hang up')
  })

  test('graphqlBody returns the parsed body whatever the status', async () => {
    const body = { errors: [{ message: 'unknown field "scriptVersion"' }] }
    const { cf } = fake(() => Response.json(body, { status: 400 }))
    expect(await cf.graphqlBody('q', {})).toEqual({ ok: true, value: body })
  })

  test('graphqlBody still fails on a non-JSON reply and on a network failure', async () => {
    const { cf } = fake(() => new Response('oops', { status: 502 }))
    expect((await cf.graphqlBody('q', {})).ok).toBe(false)
    const offline = createCloudflare({ apiToken: TOKEN, fetch: failing })
    expect((await offline.graphqlBody('q', {})).ok).toBe(false)
  })

  // エラー文字列はログや job summary に出る。トークンが混ざってはいけない（CodeQL の clear-text-logging）
  test('no error message contains the API token', async () => {
    const echo = fake(
      ({ init }) =>
        new Response(`bad ${typeof init.body === 'string' ? init.body : ''}`, { status: 500 }),
    )
    const errors = [
      await echo.cf.rest('GET', '/x'),
      await echo.cf.graphql('q', { a: 'b' }),
      await createCloudflare({ apiToken: TOKEN, fetch: failing }).graphqlBody('q', {}),
    ].flatMap((r) => (r.ok ? [] : [r.error]))
    expect(errors).toHaveLength(3)
    for (const error of errors) expect(error).not.toContain(TOKEN)
  })
})
