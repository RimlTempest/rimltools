import { describe, expect, test } from 'bun:test'

import { ASSET_SCOPES, extractAssets } from './html-assets.ts'

const PAGE = 'https://tool.example/page'
const fixture = (name: string) =>
  Bun.file(new URL(`./fixtures/${name}.html`, import.meta.url)).text()

// 統合前の 3 実装（scripts/smoke/page.ts・scripts/release/smoke.ts・scripts/ops/synthetic.ts）が
// 同じ fixture に対して返した値。統合後もこれと同じになること（挙動を変えない）。
type Expected = Record<string, { smoke: string[]; release: string[]; ops: string[] }>
const expected: Promise<Expected> = Bun.file(
  new URL('./fixtures/assets-expected.json', import.meta.url),
).json()

const smokePaths = (html: string) =>
  extractAssets(html, PAGE, ASSET_SCOPES.deployedAssets)
    .map((href) => {
      const url = new URL(href)
      return `${url.pathname}${url.search}`
    })
    .toSorted()

describe('extractAssets matches the three former implementations', () => {
  test.each(['qrcc-home', 'noter-home'])('on the production page %s', async (name) => {
    const html = await fixture(name)
    const want = (await expected)[name]
    expect(smokePaths(html)).toEqual(want?.smoke ?? [])
    expect(extractAssets(html, PAGE, ASSET_SCOPES.release)).toEqual(want?.release ?? [])
    expect(extractAssets(html, PAGE, ASSET_SCOPES.synthetic)).toEqual(want?.ops ?? [])
  })

  test('on the edge cases, release and synthetic are unchanged', async () => {
    const html = await fixture('assets-edge')
    const want = (await expected)['assets-edge']
    expect(extractAssets(html, PAGE, ASSET_SCOPES.release)).toEqual(want?.release ?? [])
    expect(extractAssets(html, PAGE, ASSET_SCOPES.synthetic)).toEqual(want?.ops ?? [])
  })

  // 旧 smoke は "…" しか読めず、'…' で書かれた /assets/ を見落としていた（Vite の出力は常に "…"
  // なので実際のページでは差が出ない）。統合後は属性を解析するので '…' も拾う。意図した変更はこれだけ。
  test('on the edge cases, smoke only gains the single-quoted asset', async () => {
    const html = await fixture('assets-edge')
    const before = (await expected)['assets-edge']?.smoke ?? []
    expect(smokePaths(html)).toEqual([...before, '/assets/entry.js'].toSorted())
  })
})

describe('extractAssets', () => {
  test('keeps same-origin URLs only, in order, without duplicates', () => {
    const html =
      '<script src="/a.js"></script><script src="https://cdn.example/b.js"></script><script src="/a.js"></script><link rel="stylesheet" href="/c.css">'
    expect(extractAssets(html, PAGE, ASSET_SCOPES.synthetic)).toEqual([
      'https://tool.example/a.js',
      'https://tool.example/c.css',
    ])
  })

  test('ignores data: URLs and links whose rel is out of scope', () => {
    const html =
      '<img src="data:image/png;base64,AA"><link rel="alternate" href="/feed.xml"><link rel="icon" href="/i.svg">'
    expect(extractAssets(html, PAGE, ASSET_SCOPES.release)).toEqual(['https://tool.example/i.svg'])
    expect(extractAssets(html, PAGE, ASSET_SCOPES.synthetic)).toEqual([])
  })

  test('reads a rel list with several values', () => {
    const html = '<link rel="preload stylesheet" href="/x.css">'
    expect(extractAssets(html, PAGE, ASSET_SCOPES.synthetic)).toEqual([
      'https://tool.example/x.css',
    ])
  })

  test('a path prefix limits the scope to the uploaded assets', () => {
    const html = '<img src="/assets/a.png"><img src="/images/b.png"><a href="/assets/c.pdf">c</a>'
    expect(extractAssets(html, PAGE, ASSET_SCOPES.deployedAssets)).toEqual([
      'https://tool.example/assets/a.png',
      'https://tool.example/assets/c.pdf',
    ])
  })

  test('an attribute name that only ends with src is not src', () => {
    expect(extractAssets('<img data-src="/assets/a.png">', PAGE, ASSET_SCOPES.release)).toEqual([])
  })
})
