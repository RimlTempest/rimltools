import { describe, expect, test } from 'bun:test'

import { extractAssets, summarizeProbe } from './synthetic.ts'

const html = `<!doctype html><html><head>
<link rel="stylesheet" href="/assets/app-abc.css">
<link rel="modulepreload" href="/assets/chunk-1.js">
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.example.com">
<script type="module" src="/assets/entry-xyz.js"></script>
<script src="https://cdn.example.com/other.js"></script>
<script type="module" src="/assets/entry-xyz.js"></script>
</head><body></body></html>`

describe('extractAssets', () => {
  test('collects same-origin scripts, styles and preloads once each', () => {
    expect(extractAssets(html, 'https://qrcc.tools.example.com/')).toEqual([
      'https://qrcc.tools.example.com/assets/app-abc.css',
      'https://qrcc.tools.example.com/assets/chunk-1.js',
      'https://qrcc.tools.example.com/assets/entry-xyz.js',
    ])
  })

  test('returns nothing for a page without assets', () => {
    expect(extractAssets('<p>hi</p>', 'https://a.example.com/')).toEqual([])
  })
})

describe('summarizeProbe', () => {
  test('ok only when every check passed', () => {
    const ok = summarizeProbe('qrcc', [
      { url: 'https://a/', expected: 200, status: 200 },
      { url: 'https://a/x.js', expected: 200, status: 200 },
    ])
    expect(ok.ok).toBe(true)

    const bad = summarizeProbe('qrcc', [
      { url: 'https://a/', expected: 200, status: 200 },
      { url: 'https://a/x.js', expected: 200, status: 500 },
      { url: 'https://a/ws/', expected: 426, status: null, error: 'timeout' },
    ])
    expect(bad.ok).toBe(false)
    expect(bad.failures).toEqual([
      'https://a/x.js: expected 200, got 500',
      'https://a/ws/: expected 426, got timeout',
    ])
  })

  test('a probe with no checks is a failure (nothing was verified)', () => {
    expect(summarizeProbe('qrcc', []).ok).toBe(false)
  })
})
