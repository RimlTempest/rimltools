import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
// DOMPurify を読み込む import より前に評価する必要がある（理由は当該ファイル）。
// oxlint-disable-next-line import/no-unassigned-import -- テスト環境の当て木（副作用のみ）
import './happy-dom-node-name.test-setup.ts'
import { MarkdownPreview } from './markdown-preview.tsx'

afterEach(cleanup)

const preview = (markdown: string): HTMLElement => {
  render(<MarkdownPreview markdown={markdown} />)
  return screen.getByRole('region', { name: 'プレビュー' })
}

describe('MarkdownPreview', () => {
  test('プレビューという名前のランドマークとして読み上げられる', () => {
    render(<MarkdownPreview markdown={'# 設計\n'} />)
    expect(screen.getByRole('region', { name: 'プレビュー' })).toBeDefined()
  })

  test('見出しを見出しとして描画し、id を振る', () => {
    render(<MarkdownPreview markdown={'# 設計メモ\n'} />)
    const heading = screen.getByRole('heading', { level: 1, name: '設計メモ' })
    expect(heading.getAttribute('id')).toBe('設計メモ')
  })

  test('<script> は 1 つも残らない', () => {
    const region = preview('<script>alert(1)</script>\n\n本文\n')
    expect(region.querySelectorAll('script')).toHaveLength(0)
    expect(region.innerHTML).not.toContain('<script')
    expect(region.textContent).toContain('本文')
  })

  test('入れ子の生 HTML に書かれた script も要素にならない', () => {
    const region = preview('<div><script>alert(1)</script></div>\n')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(region.innerHTML).not.toContain('<script')
    expect(region.innerHTML).not.toContain('<div')
  })

  test('イベントハンドラ属性を持つ要素は 1 つも作られない', () => {
    const region = preview('<img src=x onerror="alert(1)">\n')
    expect(region.querySelectorAll('img')).toHaveLength(0)
    expect(region.querySelectorAll('[onerror]')).toHaveLength(0)
    expect(region.innerHTML).not.toContain('<img')
  })

  test('javascript: の URL はリンクにならない', () => {
    const region = preview('[押す](javascript:alert(1))\n')
    expect(region.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0)
  })

  test('リンクに rel="noopener" が付く', () => {
    render(<MarkdownPreview markdown={'[noter](https://example.com/)\n'} />)
    const link = screen.getByRole('link', { name: 'noter' })
    expect(link.getAttribute('rel')).toBe('noopener')
    expect(link.getAttribute('href')).toBe('https://example.com/')
  })

  test('自動リンクにも rel="noopener" が付く', () => {
    render(<MarkdownPreview markdown={'https://example.com/ を見る\n'} />)
    expect(screen.getByRole('link').getAttribute('rel')).toBe('noopener')
  })

  test('mermaid ブロックは、図が描けなくてもソースを details で読める', () => {
    render(<MarkdownPreview markdown={'```mermaid\ngraph TD;\n  A-->B;\n```\n'} />)
    const summary = screen.getByText('mermaid のソース')
    expect(summary.tagName).toBe('SUMMARY')
    expect(summary.closest('details')?.textContent).toContain('A-->B;')
  })

  test('mermaid のソースに書かれた script は要素にならない', () => {
    const region = preview('```mermaid\nA["<script>alert(1)</script>"]\n```\n')
    expect(region.querySelectorAll('script')).toHaveLength(0)
    expect(region.innerHTML).not.toContain('<script')
    expect(region.textContent).toContain('<script>alert(1)</script>')
  })

  test('mermaid の図を差し込む場所を残す', () => {
    const region = preview('```mermaid\ngraph TD;\n```\n')
    expect(region.querySelectorAll('[data-mermaid-mount]')).toHaveLength(1)
  })

  /**
   * 差し込み先が残っているだけでは足りない。React 19 は
   * `dangerouslySetInnerHTML` に別のオブジェクトを渡すたびに innerHTML を
   * 当て直すので、ポータルで入れた図が次の描画で消える（実際に消えていた）。
   */
  test('差し込み先に図の枠が入る', () => {
    const region = preview('```mermaid\ngraph TD;\n  A-->B;\n```\n')
    expect(region.querySelectorAll('.noter-mermaid-figure__svg')).toHaveLength(1)
  })

  test('本文が変わると描画も変わる', () => {
    const { rerender } = render(<MarkdownPreview markdown={'# 最初\n'} />)
    rerender(<MarkdownPreview markdown={'# 次\n'} />)
    expect(screen.getByRole('heading', { name: '次' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: '最初' })).toBeNull()
  })

  test('ランドマークの名前は変えられる（1 画面に複数置くとき）', () => {
    render(<MarkdownPreview markdown={'本文\n'} label="変換後のプレビュー" />)
    expect(screen.getByRole('region', { name: '変換後のプレビュー' })).toBeDefined()
  })

  test('空文書でも落ちない', () => {
    expect(preview('').textContent).toBe('')
  })
})
