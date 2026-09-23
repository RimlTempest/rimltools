import { describe, expect, test } from 'bun:test'

import {
  pageLines,
  pageReasons,
  probePage,
  referencedAssets,
  verdictLines,
  verdictOf,
} from './page.ts'
import type { FetchLike, PageSmoke } from './page.ts'

const html = `<link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>
<script src="/assets/app.js"></script><img src="https://cdn.example/x.png"><link rel="icon" href="/favicon.ico">`

describe('referencedAssets', () => {
  test('keeps only our own /assets/ files, once each, sorted', () => {
    expect(referencedAssets(html)).toEqual(['/assets/app.css', '/assets/app.js'])
  })
})

describe('pageReasons', () => {
  const ok: PageSmoke = {
    documentStatus: 200,
    documentBytes: 10,
    assets: [{ path: '/assets/a.js', status: 200, bytes: 5 }],
  }

  test('a page with every asset served passes', () => {
    expect(pageReasons(ok)).toEqual([])
  })

  test('reports a failed page, missing assets, broken and empty assets', () => {
    expect(pageReasons({ ...ok, documentStatus: 500, assets: [] })).toEqual([
      'トップが 500 を返した',
    ])
    expect(pageReasons({ ...ok, assets: [] })).toEqual([
      'HTML から参照されている資産が 1 本も見つからない',
    ])
    expect(
      pageReasons({
        ...ok,
        assets: [
          { path: '/assets/a.js', status: 500, bytes: 5 },
          { path: '/assets/b.js', status: 200, bytes: 0 },
        ],
      }),
    ).toEqual(['/assets/a.js が 500 を返した', '/assets/b.js は 200 だが中身が空だった'])
  })
})

describe('lines', () => {
  test('lists the page and each asset, then the verdict', () => {
    const smoke: PageSmoke = {
      documentStatus: 200,
      documentBytes: 42,
      assets: [{ path: '/assets/a.js', status: 200, bytes: 7 }],
    }
    expect([...pageLines(smoke), ...verdictLines(verdictOf(pageReasons(smoke)))]).toEqual([
      'トップ: 200 / 42 bytes / 参照資産 1 本',
      '  ✓ 200        7 B  /assets/a.js',
      '',
      '疎通確認: 合格',
    ])
    expect(verdictLines(verdictOf(['x', 'y']))).toEqual(['', '疎通確認: 不合格\n  - x\n  - y'])
  })
})

describe('probePage', () => {
  test('fetches the page, then every referenced asset', async () => {
    const seen: string[] = []
    const fetchLike: FetchLike = async (url) => {
      seen.push(url)
      return { status: 200, text: async () => (url.endsWith('/') ? html : 'body') }
    }
    const smoke = await probePage('https://x.example/', fetchLike)
    expect(smoke.assets.map((a) => a.path)).toEqual(['/assets/app.css', '/assets/app.js'])
    expect(seen.toSorted()).toEqual([
      'https://x.example/',
      'https://x.example/assets/app.css',
      'https://x.example/assets/app.js',
    ])
  })

  test('does not look for assets when the page fails', async () => {
    const smoke = await probePage('https://x.example/', async () => ({
      status: 503,
      text: async () => html,
    }))
    expect(smoke).toEqual({ documentStatus: 503, documentBytes: html.length, assets: [] })
  })
})
