import { describe, expect, test } from 'bun:test'

import { githubClient } from './github.ts'

type Call = { url: string; method: string; body: unknown }

const recorder = (responses: unknown[]) => {
  const calls: Call[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const next = responses.shift() ?? {}
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchFn, calls }
}

const client = (fetchFn: (url: string, init?: RequestInit) => Promise<Response>) =>
  githubClient({ fetch: fetchFn, token: 't', repository: 'o/r', apiUrl: 'https://api.github.com' })

const unauthorized = async () => new Response('{"message":"Bad credentials"}', { status: 401 })

describe('githubClient', () => {
  test('finds the open issue carrying the marker, ignoring pull requests', async () => {
    const { fetchFn, calls } = recorder([
      [
        { number: 1, body: 'other', pull_request: {} },
        { number: 2, body: 'x <!-- m --> y' },
        { number: 3, body: 'nothing' },
      ],
    ])
    const found = await client(fetchFn).findOpenIssue('incident', '<!-- m -->')
    expect(found).toEqual({ ok: true, value: 2 })
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/o/r/issues?state=open&labels=incident&per_page=100',
    )
  })

  test('returns null when no issue matches', async () => {
    const { fetchFn } = recorder([[{ number: 3, body: 'nothing' }]])
    expect(await client(fetchFn).findOpenIssue('incident', '<!-- m -->')).toEqual({
      ok: true,
      value: null,
    })
  })

  test('creates, comments and closes', async () => {
    const { fetchFn, calls } = recorder([{ number: 9 }, {}, {}, {}])
    const gh = client(fetchFn)
    expect(await gh.createIssue('t', 'b', ['incident'])).toEqual({ ok: true, value: 9 })
    await gh.comment(9, 'c')
    await gh.close(9, 'bye')
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', 'https://api.github.com/repos/o/r/issues'],
      ['POST', 'https://api.github.com/repos/o/r/issues/9/comments'],
      ['POST', 'https://api.github.com/repos/o/r/issues/9/comments'],
      ['PATCH', 'https://api.github.com/repos/o/r/issues/9'],
    ])
    expect(calls[3]?.body).toEqual({ state: 'closed', state_reason: 'completed' })
  })

  test('turns an HTTP error into a Result error', async () => {
    const result = await client(unauthorized).createIssue('t', 'b', [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('401')
  })
})
