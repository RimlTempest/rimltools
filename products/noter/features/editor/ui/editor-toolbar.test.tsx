import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_DOCUMENT_BYTES } from '@noter/contract'
import type { ImportPlacement } from './editor-toolbar.tsx'
import { EditorToolbar } from './editor-toolbar.tsx'

afterEach(cleanup)

type Calls = {
  imported: { text: string; placement: ImportPlacement }[]
  downloads: number
  copies: number
  rawCopies: number
  notices: string[]
  modes: string[]
}

const setup = (
  props: Partial<Parameters<typeof EditorToolbar>[0]> = {},
  options: { readonly withoutImport?: boolean } = {},
) => {
  const calls: Calls = {
    imported: [],
    downloads: 0,
    copies: 0,
    rawCopies: 0,
    notices: [],
    modes: [],
  }
  render(
    <EditorToolbar
      mode="split"
      onModeChange={(mode) => calls.modes.push(mode)}
      {...(options.withoutImport === true
        ? {}
        : {
            onImport: (text: string, placement: ImportPlacement) =>
              calls.imported.push({ text, placement }),
          })}
      onDownload={() => (calls.downloads += 1)}
      onCopyText={() => (calls.copies += 1)}
      onCopyRawUrl={() => (calls.rawCopies += 1)}
      rawUrl="https://noter.example/d/doc_1/raw"
      onNotice={(message) => calls.notices.push(message)}
      {...props}
    />,
  )
  return calls
}

const pickFile = async (text: string) => {
  const file = new File([text], 'memo.md', { type: 'text/markdown' })
  await userEvent.upload(screen.getByLabelText('ファイルを取り込む'), file)
}

describe('EditorToolbar', () => {
  test('表示切替を出す', () => {
    const calls = setup()
    expect(screen.getByRole('group', { name: '表示' })).toBeDefined()
    expect(calls.modes).toEqual([])
  })

  test('書き出しの 3 つの出口を出す', async () => {
    const calls = setup()
    await userEvent.click(screen.getByRole('button', { name: '端末に保存' }))
    await userEvent.click(screen.getByRole('button', { name: '本文をコピー' }))
    await userEvent.click(screen.getByRole('button', { name: 'raw の URL をコピー' }))
    expect([calls.downloads, calls.copies, calls.rawCopies]).toEqual([1, 1, 1])
  })

  test('raw をそのまま開くリンクがある', () => {
    setup()
    expect(screen.getByRole('link', { name: '本文をそのまま開く' })).toHaveProperty(
      'href',
      'https://noter.example/d/doc_1/raw',
    )
  })

  test('取り込みは置き換えるか挿入かを確かめてから行う', async () => {
    const calls = setup()
    await pickFile('# 取り込んだ本文')
    await userEvent.click(await screen.findByRole('button', { name: '置き換える' }))
    expect(calls.imported).toEqual([{ text: '# 取り込んだ本文', placement: 'replace' }])
  })

  test('カーソル位置に挿入も選べる', async () => {
    const calls = setup()
    await pickFile('追記')
    await userEvent.click(await screen.findByRole('button', { name: 'カーソル位置に挿入' }))
    expect(calls.imported).toEqual([{ text: '追記', placement: 'cursor' }])
  })

  test('上限を超えるファイルは拒否して理由を出す', async () => {
    const calls = setup()
    await pickFile('a'.repeat(MAX_DOCUMENT_BYTES + 1))
    await waitFor(() => expect(calls.notices).toHaveLength(1))
    expect(calls.notices[0]).toContain('大きすぎます')
    expect(calls.imported).toEqual([])
    expect(screen.queryByRole('button', { name: '置き換える' })).toBeNull()
  })

  test('閲覧のみの人には取り込みを出さない', () => {
    setup({}, { withoutImport: true })
    expect(screen.queryByLabelText('ファイルを取り込む')).toBeNull()
    // 書き出しは閲覧のみでもできる
    expect(screen.getByRole('button', { name: '端末に保存' })).toBeDefined()
  })

  test('整形は渡されたときだけ出す（plan 006 が差し込む）', async () => {
    setup()
    expect(screen.queryByRole('button', { name: '整形' })).toBeNull()
    cleanup()
    let formatted = 0
    setup({ formatAction: () => (formatted += 1) })
    await userEvent.click(screen.getByRole('button', { name: '整形' }))
    expect(formatted).toBe(1)
  })

  test('問題は渡されたときだけ出す（plan 006 が差し込む）', async () => {
    setup()
    expect(screen.queryByRole('button', { name: /問題/ })).toBeNull()
    cleanup()
    let toggled = 0
    setup({ problems: { count: 2, expanded: false, onToggle: () => (toggled += 1) } })
    const button = screen.getByRole('button', { name: '問題 2 件' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(button)
    expect(toggled).toBe(1)
  })
})
