import { describe, expect, test } from 'bun:test'

import { renderIndex, renderNotFound, type PortalTool } from './render.ts'

const tools: PortalTool[] = [
  {
    name: 'qrcc',
    title: 'QR・バーコード',
    description: '生成 / 読み取り',
    host: 'qrcc.tools.example.com',
    listed: true,
  },
  {
    name: 'noter',
    title: 'noter',
    description: '共同編集 <beta> & "fast"',
    host: 'noter.tools.example.com',
    listed: true,
  },
  {
    name: 'portal',
    title: 'RimlTools',
    description: '一覧',
    host: 'tools.example.com',
    listed: false,
  },
]

describe('renderIndex', () => {
  const html = renderIndex({ domain: 'tools.example.com', tools })

  test('is a Japanese document with one h1 and a stylesheet link', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="ja">')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
  })

  test('reads riml-ds のトークンを styles.css より先に読む（別名が解決できるように）', () => {
    const tokens = html.indexOf('<link rel="stylesheet" href="/tokens.css">')
    const styles = html.indexOf('<link rel="stylesheet" href="/styles.css">')
    expect(tokens).toBeGreaterThan(-1)
    expect(tokens).toBeLessThan(styles)
  })

  test('links every listed tool to its host and hides unlisted ones', () => {
    expect(html).toContain('<a href="https://qrcc.tools.example.com/">')
    expect(html).toContain('<a href="https://noter.tools.example.com/">')
    expect(html).not.toContain('https://tools.example.com/"')
  })

  test('uses a list with headings so screen readers can navigate tools', () => {
    expect(html).toContain('<ul class="tools" role="list">')
    expect(html.match(/<h2\b/g)).toHaveLength(2)
  })

  test('escapes text from the registry', () => {
    expect(html).toContain('共同編集 &lt;beta&gt; &amp; &quot;fast&quot;')
    expect(html).not.toContain('<beta>')
  })

  test('has no inline script or style (the CSP forbids them)', () => {
    expect(html).not.toMatch(/<script\b/)
    expect(html).not.toMatch(/<style\b/)
    expect(html).not.toMatch(/\sstyle=/)
  })
})

describe('renderNotFound', () => {
  test('points back to the portal', () => {
    const html = renderNotFound({ domain: 'tools.example.com', tools })
    expect(html).toContain('<html lang="ja">')
    expect(html).toContain('<a href="/">')
  })
})
