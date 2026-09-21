import { describe, expect, test } from 'bun:test'

import {
  redactUrls,
  startBrowserTelemetry,
  startFromDocument,
  stripQuery,
  type FaroLoader,
} from './index.ts'

const config = {
  url: 'https://faro.test/collect/abc',
  app: 'qrcc',
  environment: 'staging',
  version: 'abc123',
  sampleRate: 0.2,
}

describe('stripQuery', () => {
  test.each([
    ['https://qrcc.test/codes?token=secret#x', 'https://qrcc.test/codes'],
    ['/relative?q=1', '/relative'],
    ['no url here? really', 'no url here? really'],
  ])('%s → %s', (input, expected) => {
    expect(stripQuery(input)).toBe(expected)
  })
})

describe('redactUrls', () => {
  test('removes query strings from every URL-looking string, in place', () => {
    const item = {
      meta: { page: { url: 'https://qrcc.test/share?token=abc' } },
      payload: {
        attributes: { 'http.url': 'https://qrcc.test/api?x=1', note: 'plain text' },
        list: ['https://a.test/?q'],
      },
    }
    redactUrls(item)
    expect(item.meta.page.url).toBe('https://qrcc.test/share')
    expect(item.payload.attributes['http.url']).toBe('https://qrcc.test/api')
    expect(item.payload.attributes.note).toBe('plain text')
    expect(item.payload.list).toEqual(['https://a.test/'])
  })
})

const loader = () => {
  const calls: unknown[] = []
  const load: FaroLoader = async () => ({
    initialize: (options) => {
      calls.push(options)
    },
  })
  return { calls, load }
}

const failingLoad: FaroLoader = async () => Promise.reject(new Error('chunk failed'))

describe('startBrowserTelemetry', () => {
  test('does nothing (and loads nothing) without config', async () => {
    const { calls, load } = loader()
    expect(await startBrowserTelemetry(null, { load, random: () => 0 })).toBe('disabled')
    expect(calls).toEqual([])
  })

  test('skips unsampled sessions before downloading the SDK', async () => {
    let loaded = false
    const load: FaroLoader = async () => {
      loaded = true
      return { initialize: () => undefined }
    }
    expect(await startBrowserTelemetry(config, { load, random: () => 0.5 })).toBe('unsampled')
    expect(loaded).toBe(false)
  })

  test('initializes Faro for sampled sessions', async () => {
    const { calls, load } = loader()
    expect(await startBrowserTelemetry(config, { load, random: () => 0.1 })).toBe('started')
    expect(calls).toEqual([
      {
        url: 'https://faro.test/collect/abc',
        app: { name: 'qrcc', version: 'abc123', environment: 'staging', namespace: 'rimltools' },
      },
    ])
  })

  test('reports a loader failure instead of throwing', async () => {
    expect(await startBrowserTelemetry(config, { load: failingLoad, random: () => 0 })).toBe(
      'failed',
    )
  })
})

const doc = (content: string | null) => ({
  querySelector: (selector: string) =>
    selector === 'meta[name="rimltools-telemetry"]' && content !== null
      ? { getAttribute: (name: string) => (name === 'content' ? content : null) }
      : null,
})

describe('startFromDocument', () => {
  test('reads the meta tag written by the Worker', async () => {
    const { calls, load } = loader()
    const result = await startFromDocument(doc(JSON.stringify(config)), { load, random: () => 0 })
    expect(result).toBe('started')
    expect(calls).toHaveLength(1)
  })

  test('is disabled without the meta tag or with a broken one', async () => {
    const { load } = loader()
    expect(await startFromDocument(doc(null), { load, random: () => 0 })).toBe('disabled')
    expect(await startFromDocument(doc('{oops'), { load, random: () => 0 })).toBe('disabled')
  })
})
