import { describe, expect, test } from 'bun:test'
import { defaultMermaidPlaceholder, renderMarkdown, slugify } from './render-markdown.ts'

describe('slugify', () => {
  test('小文字にして空白をハイフンにする', () => {
    expect(slugify('Getting Started')).toBe('getting-started')
  })

  test('日本語はそのまま残す', () => {
    expect(slugify('設計 メモ')).toBe('設計-メモ')
  })

  test('記号を落とす', () => {
    expect(slugify('a/b: c?')).toBe('ab-c')
  })

  test('空になるときは undefined を返す', () => {
    expect(slugify('!!!')).toBeUndefined()
  })
})

describe('renderMarkdown', () => {
  test('見出しに id を振る', () => {
    expect(renderMarkdown('# 設計メモ\n')).toContain('<h1 id="設計メモ">')
  })

  test('同じ見出しが 2 つあるときは id を重複させない', () => {
    const html = renderMarkdown('# a\n\n# a\n')
    expect(html).toContain('<h1 id="a">')
    expect(html).toContain('<h1 id="a-2">')
  })

  test('リンクに rel="noopener" を付ける', () => {
    const html = renderMarkdown('[noter](https://example.com/)\n')
    expect(html).toContain('rel="noopener"')
  })

  test('linkify で自動リンクにした URL にも rel="noopener" を付ける', () => {
    const html = renderMarkdown('https://example.com/ を見る\n')
    expect(html).toContain('<a')
    expect(html).toContain('rel="noopener"')
  })

  test('生の HTML はエスケープする（html: false）', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('インライン HTML もエスケープする', () => {
    const html = renderMarkdown('文中の <img src=x onerror=alert(1)> です\n')
    expect(html).not.toContain('<img')
  })

  test('mermaid のフェンスをプレースホルダに置き換える', () => {
    const html = renderMarkdown('```mermaid\ngraph TD;\n  A-->B;\n```\n')
    expect(html).toContain('class="noter-mermaid"')
    expect(html).toContain('data-index="0"')
    expect(html).toContain('data-mermaid-mount="0"')
    expect(html).toContain('<summary>mermaid のソース</summary>')
    expect(html).toContain('graph TD;')
    expect(html).not.toContain('<code class="language-mermaid">')
  })

  test('mermaid ブロックには 0 から順に番号を振る', () => {
    const html = renderMarkdown('```mermaid\na\n```\n\n本文\n\n```mermaid\nb\n```\n')
    expect(html).toContain('data-index="0"')
    expect(html).toContain('data-index="1"')
  })

  test('mermaid のソースに含まれる HTML をエスケープする', () => {
    const html = renderMarkdown('```mermaid\ngraph TD;\n  A["<script>"]-->B;\n```\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('mermaid 以外のフェンスは通常のコードブロックのまま', () => {
    const html = renderMarkdown('```ts\nconst a = 1\n```\n')
    expect(html).toContain('<code')
    expect(html).not.toContain('noter-mermaid')
  })

  test('プレースホルダの描画は差し替えられる', () => {
    const html = renderMarkdown('```mermaid\ngraph TD;\n```\n', {
      renderMermaidPlaceholder: (block) => `<p>図 ${block.index}: ${block.source.trim()}</p>`,
    })
    expect(html).toContain('<p>図 0: graph TD;</p>')
  })

  test('空文書は空文字列', () => {
    expect(renderMarkdown('')).toBe('')
  })
})

describe('defaultMermaidPlaceholder', () => {
  test('JS が動かなくてもソースが読める details を含む', () => {
    const html = defaultMermaidPlaceholder({ index: 2, source: 'graph TD;' })
    expect(html).toContain('data-index="2"')
    expect(html).toContain('<details')
    expect(html).toContain('graph TD;')
  })
})
