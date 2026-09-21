import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { documentHead, RootDocument } from './root-document.tsx'

describe('documentHead', () => {
  const head = documentHead('/app.css')()

  test('manifest へのリンクが出る', () => {
    expect(head.links).toContainEqual({
      rel: 'manifest',
      href: '/manifest.webmanifest',
    })
  })

  test('favicon（SVG）へのリンクが出る', () => {
    expect(head.links).toContainEqual({
      rel: 'icon',
      href: '/icon.svg',
      type: 'image/svg+xml',
    })
  })

  test('apple-touch-icon へのリンクが出る', () => {
    expect(head.links).toContainEqual({
      rel: 'apple-touch-icon',
      href: '/apple-touch-icon.png',
    })
  })

  test('theme-color を含まない（TanStack Router の head 管理は name で重複排除するため、ここに置くと片方しか配信 HTML に残らない）', () => {
    const hasThemeColor = head.meta.some((entry) => 'name' in entry && entry.name === 'theme-color')
    expect(hasThemeColor).toBe(false)
  })
})

describe('RootDocument', () => {
  // documentHead() が返す値ではなく、実際に配信される HTML 文字列を検査する。
  // 以前はここを見ていなかったせいで、TanStack Router の head 管理による
  // 重複排除（name が同じ meta は後勝ちで 1 つに潰れる）を見逃していた
  const html = renderToStaticMarkup(<RootDocument>本文</RootDocument>)
  const themeColorTags = [...html.matchAll(/<meta[^>]*name="theme-color"[^>]*>/g)].map(
    (match) => match[0],
  )

  test('theme-color がライトとダークの 2 つとも配信 HTML に出る', () => {
    expect(themeColorTags).toHaveLength(2)
  })

  test('ライト側の theme-color の内容が正しい', () => {
    expect(
      themeColorTags.some(
        (tag) =>
          tag.includes('content="#ffffff"')
          && tag.includes('media="(prefers-color-scheme: light)"'),
      ),
    ).toBe(true)
  })

  test('ダーク側の theme-color の内容が正しい', () => {
    expect(
      themeColorTags.some(
        (tag) =>
          tag.includes('content="#0f1217"') && tag.includes('media="(prefers-color-scheme: dark)"'),
      ),
    ).toBe(true)
  })
})
