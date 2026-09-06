import { describe, expect, test } from 'bun:test'
import { documentHead } from './root-document.tsx'

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

  test('theme-color がライトとダークの 2 つ出る（片方だけだとアドレスバーの色が食い違う）', () => {
    const themeColors = head.meta.filter(
      (
        entry,
      ): entry is { readonly name: string; readonly content: string; readonly media: string } =>
        'name' in entry && entry.name === 'theme-color',
    )
    expect(themeColors).toHaveLength(2)
    expect(themeColors).toContainEqual({
      name: 'theme-color',
      content: '#ffffff',
      media: '(prefers-color-scheme: light)',
    })
    expect(themeColors).toContainEqual({
      name: 'theme-color',
      content: '#0f1217',
      media: '(prefers-color-scheme: dark)',
    })
  })
})
