import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createShell } from './index.ts'

afterEach(cleanup)

const shell = createShell({
  prefix: 'demo',
  brand: { name: 'demo', tagline: 'demo — 共通化のテスト' },
  navItems: [
    { to: '/', label: 'ホーム' },
    { to: '/about', label: 'このツールについて' },
  ],
  SkipLink: ({ targetId }) => <a href={`#${targetId}`}>本文へスキップ</a>,
  themeInitScript: 'window.__theme=1',
  themeColor: { light: '#fafafa', dark: '#101010' },
  title: 'demo — タイトル',
  description: '説明文',
})

const trail = [
  { to: '/', label: 'ホーム' },
  { to: '/x', label: '設定' },
]

describe('createShell', () => {
  test('AppShell はプロダクトの接頭辞・サイト名・ナビ項目・フッターで描く', () => {
    render(
      <shell.AppShell currentPath="/about">
        <p>本文</p>
      </shell.AppShell>,
    )
    expect(screen.getByRole('banner').className).toBe('demo-header')
    expect(screen.getByText('demo').className).toBe('demo-header__brand')
    const nav = screen.getByRole('navigation', { name: 'グローバル' })
    expect(nav.className).toBe('demo-global-nav')
    expect(
      screen.getByRole('link', { name: 'このツールについて' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('contentinfo').textContent).toBe('demo — 共通化のテスト')
    expect(screen.getByRole('main').id).toBe('main')
  })

  test('Breadcrumbs は接頭辞付きで、最後の項目を現在地にする', () => {
    render(<shell.Breadcrumbs trail={trail} />)
    expect(screen.getByRole('navigation', { name: 'パンくず' }).className).toBe('demo-breadcrumbs')
    expect(screen.getByText('設定').getAttribute('aria-current')).toBe('page')
  })

  test('RootDocument はテーマ初期化・テーマ色・スキップリンクを入れる', () => {
    const html = renderToStaticMarkup(<shell.RootDocument>x</shell.RootDocument>)
    expect(html).toContain('<script>window.__theme=1</script>')
    expect(html).toContain('content="#fafafa" media="(prefers-color-scheme: light)"')
    expect(html).toContain('content="#101010" media="(prefers-color-scheme: dark)"')
    expect(html).toContain('href="#main"')
  })

  test('documentHead はタイトル・説明・スタイルシート・PWA のリンクを返す', () => {
    const head = shell.documentHead('/app.css')()
    expect(head.meta).toContainEqual({ title: 'demo — タイトル' })
    expect(head.meta).toContainEqual({ name: 'description', content: '説明文' })
    expect(head.links.map((l) => l.rel)).toEqual([
      'stylesheet',
      'icon',
      'manifest',
      'apple-touch-icon',
    ])
  })
})
