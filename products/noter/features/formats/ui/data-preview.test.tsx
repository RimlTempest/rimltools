import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataPreview } from './data-preview.tsx'

afterEach(cleanup)

describe('DataPreview', () => {
  test('プレビューという名前のランドマークとして読み上げられる', () => {
    render(<DataPreview kind="json" text='{"a":1}' />)
    expect(screen.getByRole('region', { name: 'プレビュー' })).toBeDefined()
  })

  test('JSON は既定でツリー表示', () => {
    render(<DataPreview kind="json" text='{"a":1}' />)
    expect(screen.getByRole('button', { name: 'ツリーで表示' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  test('yaml と toml は既定でテキスト表示', () => {
    render(<DataPreview kind="yaml" text={'a: 1\n'} />)
    expect(
      screen.getByRole('button', { name: 'テキストで表示' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  test('テキスト表示は整形済みの本文を出す', async () => {
    render(<DataPreview kind="json" text='{"a":1,"b":[1,2]}' />)
    await userEvent.click(screen.getByRole('button', { name: 'テキストで表示' }))
    const caption = screen.getByText('整形した本文')
    expect(caption.tagName).toBe('FIGCAPTION')
    expect(caption.closest('figure')?.querySelector('code')?.textContent).toBe(
      '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n',
    )
  })

  test('ツリー表示ではキーと値をリストの項目として並べる', () => {
    render(<DataPreview kind="json" text='{"name":"noter","port":80}' />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['name"noter"', 'port80'])
  })

  test('葉と枝の項目は、それぞれの見た目の class を持つ', () => {
    render(<DataPreview kind="json" text='{"a":1,"b":{"c":2},"d":[]}' />)
    const classes = screen.getAllByRole('listitem').map((item) => item.className)
    expect(classes).toEqual([
      'noter-json-tree__leaf',
      'noter-json-tree__branch',
      'noter-json-tree__leaf',
      'noter-json-tree__leaf',
    ])
  })

  test('入れ子は details で畳める', () => {
    render(<DataPreview kind="json" text='{"server":{"port":80}}' />)
    const group = screen.getByText(/^server$/)
    const details = group.closest('details')
    expect(details).not.toBeNull()
    expect(within(details ?? document.body).getByText('port')).toBeDefined()
  })

  test('配列は添字をキーとして並べる', () => {
    render(<DataPreview kind="json" text='{"hosts":["a","b"]}' />)
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getByText('1')).toBeDefined()
  })

  test('null と真偽値をそのまま見せる', () => {
    render(<DataPreview kind="json" text='{"a":null,"b":true}' />)
    expect(screen.getByText('null')).toBeDefined()
    expect(screen.getByText('true')).toBeDefined()
  })

  test('空のオブジェクトは「空」と示す', () => {
    render(<DataPreview kind="json" text='{"a":{}}' />)
    expect(screen.getByText('空のオブジェクト')).toBeDefined()
  })

  test('2 つのモードを行き来できる', async () => {
    render(<DataPreview kind="yaml" text={'a: 1\n'} />)
    const tree = screen.getByRole('button', { name: 'ツリーで表示' })
    await userEvent.click(tree)
    expect(tree.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'テキストで表示' }))
    expect(tree.getAttribute('aria-pressed')).toBe('false')
  })

  test('壊れた文書は理由を出し、本文はそのまま見せる', () => {
    render(<DataPreview kind="json" text={'{\n  "a": 1,\n'} />)
    expect(screen.getByText(/構文エラー/)).toBeDefined()
    const caption = screen.getByText('本文')
    expect(caption.tagName).toBe('FIGCAPTION')
    expect(caption.closest('figure')?.querySelector('code')?.textContent).toBe('{\n  "a": 1,\n')
  })

  test('ランドマークの名前は変えられる', () => {
    render(<DataPreview kind="json" text="{}" label="変換後のプレビュー" />)
    expect(screen.getByRole('region', { name: '変換後のプレビュー' })).toBeDefined()
  })
})
