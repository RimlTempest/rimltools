import { describe, expect, test } from 'bun:test'

import { probeTool, probeWithRetry } from './probe.ts'

type Route = { status: number; body?: string }

const fakeFetch = (routes: Record<string, Route | 'throw'>) => {
  const calls: string[] = []
  const fetchFn = async (input: string) => {
    calls.push(input)
    const route = routes[input]
    if (route === undefined) return new Response('nf', { status: 404 })
    if (route === 'throw') throw new TypeError('network down')
    return new Response(route.body ?? '', { status: route.status })
  }
  return { fetchFn, calls }
}

const page =
  '<script type="module" src="/assets/entry.js"></script><link rel="stylesheet" href="/assets/a.css">'

describe('probeTool', () => {
  test('checks the page, its assets and the tool specific extras', async () => {
    const { fetchFn, calls } = fakeFetch({
      'https://n.example.com/': { status: 200, body: page },
      'https://n.example.com/assets/entry.js': { status: 200 },
      'https://n.example.com/assets/a.css': { status: 200 },
      'https://n.example.com/ws/': { status: 426 },
    })
    const summary = await probeTool({ fetch: fetchFn }, { name: 'noter', host: 'n.example.com' }, [
      { path: '/ws/', expected: 426 },
    ])
    expect(summary.ok).toBe(true)
    expect(calls).toHaveLength(4)
  })

  test('reports a broken asset and a network error', async () => {
    const { fetchFn } = fakeFetch({
      'https://q.example.com/': { status: 200, body: page },
      'https://q.example.com/assets/entry.js': { status: 500 },
      'https://q.example.com/assets/a.css': 'throw',
    })
    const summary = await probeTool({ fetch: fetchFn }, { name: 'qrcc', host: 'q.example.com' }, [])
    expect(summary.ok).toBe(false)
    expect(summary.failures).toEqual([
      'https://q.example.com/assets/entry.js: expected 200, got 500',
      'https://q.example.com/assets/a.css: expected 200, got network down',
    ])
  })

  test('does not chase assets when the page itself is down', async () => {
    const { fetchFn, calls } = fakeFetch({ 'https://q.example.com/': { status: 503, body: page } })
    const summary = await probeTool({ fetch: fetchFn }, { name: 'qrcc', host: 'q.example.com' }, [])
    expect(summary.ok).toBe(false)
    expect(calls).toEqual(['https://q.example.com/'])
  })
})

const badGateway = async () => new Response('', { status: 502 })
const noSleep = async () => {}

describe('probeWithRetry', () => {
  test('a single blip is not an incident: retries once after the delay', async () => {
    let n = 0
    const fetchFn = async () => {
      n += 1
      return new Response('', { status: n === 1 ? 502 : 200 })
    }
    const slept: number[] = []
    const result = await probeWithRetry(
      { fetch: fetchFn, sleep: async (ms) => void slept.push(ms) },
      { name: 'p', host: 'p.example.com' },
      [],
      60_000,
    )
    expect(result.failing).toBe(false)
    expect(slept).toEqual([60_000])
  })

  test('two consecutive failures confirm the incident', async () => {
    const result = await probeWithRetry(
      { fetch: badGateway, sleep: noSleep },
      { name: 'p', host: 'p.example.com' },
      [],
      1,
    )
    expect(result.failing).toBe(true)
    expect(result.last.failures).toEqual(['https://p.example.com/: expected 200, got 502'])
  })
})
