import { describe, expect, test } from 'bun:test'

import { overrideHeader, referencedAssets, runSmoke } from './smoke.ts'

describe('referencedAssets', () => {
  test('collects same-origin scripts, styles, preloads and images', () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/app-1.css">
      <link rel="modulepreload" href="/assets/chunk-2.js">
      <link rel="icon" href="https://cdn.example/icon.png">
      <script type="module" src="/assets/entry-3.js"></script>
      </head><body><img src="logo.svg" alt=""><a href="/about">x</a></body></html>`
    expect(referencedAssets(html, 'https://t.example/')).toEqual([
      'https://t.example/assets/app-1.css',
      'https://t.example/assets/chunk-2.js',
      'https://t.example/assets/entry-3.js',
      'https://t.example/logo.svg',
    ])
  })
})

describe('overrideHeader', () => {
  test('formats the version override header', () => {
    expect(overrideHeader('qrcc-web', 'abc')).toEqual({
      'Cloudflare-Workers-Version-Overrides': 'qrcc-web="abc"',
    })
  })
})

describe('runSmoke', () => {
  const page = '<script src="/a.js"></script><link rel="stylesheet" href="/b.css">'

  test('passes when the page and every asset answer 200, sending the headers each time', async () => {
    const seen: string[] = []
    const fetcher = async (url: string, init: { headers: Record<string, string> }) => {
      seen.push(`${url} ${init.headers['X-Test'] ?? ''}`)
      return { status: 200, text: async () => (url.endsWith('/') ? page : '') }
    }
    const result = await runSmoke('https://t.example/', { 'X-Test': '1' }, fetcher)
    expect(result.ok).toBe(true)
    expect(seen).toEqual([
      'https://t.example/ 1',
      'https://t.example/a.js 1',
      'https://t.example/b.css 1',
    ])
  })

  test('fails with every broken asset listed', async () => {
    const fetcher = async (url: string) => ({
      status: url.endsWith('a.js') ? 500 : 200,
      text: async () => (url.endsWith('/') ? page : ''),
    })
    const result = await runSmoke('https://t.example/', {}, fetcher)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('500 https://t.example/a.js')
  })
})
