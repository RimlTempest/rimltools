import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { err, ok, parseDocumentId, parseUserId } from '@noter/contract'
import type { Role } from '@noter/contract'
import type { DocumentHeader } from '@noter/documents/contract'
import type { DocumentActions, Peer, StatusText } from '../contract/index.ts'
import { EditorHeader } from './editor-header.tsx'

afterEach(cleanup)

const id = (raw: string, prefix: string) => `${prefix}_${raw.padStart(24, '0')}`

const OWNER = (() => {
  const parsed = parseUserId(id('1', 'usr'))
  if (!parsed.ok) throw new Error('fixture')
  return parsed.value
})()

const DOCUMENT: DocumentHeader = (() => {
  const parsed = parseDocumentId(id('1', 'doc'))
  if (!parsed.ok) throw new Error('fixture')
  return {
    id: parsed.value,
    ownerId: OWNER,
    title: '設計メモ',
    kind: 'markdown',
    updatedAt: new Date('2026-09-06T03:04:05.000Z'),
  }
})()

const STATUS: StatusText = { label: '同期済み · 12:34', announce: null, tone: 'success' }

const PEERS: readonly Peer[] = [{ clientId: 1, name: '佐藤', colorIndex: 2 }]

type Calls = { renamed: string[]; removed: number; left: number; announced: string[] }

const setup = (
  role: Role,
  overrides: Partial<DocumentActions> = {},
  props: { readonly onShare?: () => void } = {},
) => {
  const calls: Calls = { renamed: [], removed: 0, left: 0, announced: [] }
  const actions: DocumentActions = {
    rename: async (title) => {
      calls.renamed.push(title)
      return ok(title)
    },
    remove: async () => {
      calls.removed += 1
      return ok(undefined)
    },
    leave: async () => {
      calls.left += 1
      return ok(undefined)
    },
    ...overrides,
  }
  render(
    <EditorHeader
      document={DOCUMENT}
      actorRole={role}
      status={STATUS}
      peers={PEERS}
      actions={actions}
      onAnnounce={(message) => calls.announced.push(message)}
      {...props}
    />,
  )
  return calls
}

/** メニューは `<details>`。開いてから中の操作を押す。 */
const openMenu = async () => {
  await userEvent.click(screen.getByText('その他の操作'))
}

describe('EditorHeader', () => {
  test('編集できる人はタイトルを直接書き換えられる', () => {
    setup('owner')
    expect(screen.getByLabelText('文書のタイトル')).toHaveProperty('value', '設計メモ')
  })

  test('閲覧のみの人にはタイトル入力を出さない', () => {
    setup('viewer')
    expect(screen.queryByLabelText('文書のタイトル')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('設計メモ')
  })

  /** axe の best-practice（page-has-heading-one）。編集できるときも見出しは要る。 */
  test('編集できるときも h1 は 1 つある', () => {
    setup('editor')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('種別と自分の権限が読める', () => {
    setup('viewer')
    expect(screen.getByText('Markdown')).toBeDefined()
    expect(screen.getByText('あなたの権限: 閲覧のみ')).toBeDefined()
  })

  test('タイトルを変えて Enter で送ると保存され、結果を読み上げる', async () => {
    const calls = setup('editor')
    const field = screen.getByLabelText('文書のタイトル')
    await userEvent.clear(field)
    await userEvent.type(field, '新しい表題{Enter}')
    await waitFor(() => expect(calls.renamed).toEqual(['新しい表題']))
    expect(calls.announced).toContain('表題を変更しました。')
  })

  test('変えていないときは送らない', async () => {
    const calls = setup('editor')
    await userEvent.type(screen.getByLabelText('文書のタイトル'), '{Enter}')
    expect(calls.renamed).toEqual([])
  })

  test('保存に失敗したら理由を読み上げる', async () => {
    const calls = setup('editor', { rename: async () => err({ kind: 'forbidden' }) })
    const field = screen.getByLabelText('文書のタイトル')
    await userEvent.clear(field)
    await userEvent.type(field, 'だめな表題{Enter}')
    await waitFor(() =>
      expect(calls.announced).toContain(
        'この操作を行う権限がありません。文書の所有者に依頼してください。',
      ),
    )
  })

  test('共有ボタンは渡されたときだけ出す（owner のみ）', () => {
    setup('viewer')
    expect(screen.queryByRole('button', { name: '共有' })).toBeNull()
    cleanup()
    let opened = 0
    setup('owner', {}, { onShare: () => (opened += 1) })
    expect(screen.getByRole('button', { name: '共有' })).toBeDefined()
  })

  test('削除は 2 段階で確かめてから実行する', async () => {
    const calls = setup('owner')
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'この文書を削除' }))
    expect(calls.removed).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(calls.removed).toBe(1))
  })

  test('削除をやめられる', async () => {
    const calls = setup('owner')
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'この文書を削除' }))
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(calls.removed).toBe(0)
  })

  test('所有者以外は退出でき、所有者には削除だけを出す', async () => {
    const calls = setup('editor')
    await openMenu()
    expect(screen.queryByRole('button', { name: 'この文書を削除' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'この文書から退出' }))
    await userEvent.click(screen.getByRole('button', { name: '退出する' }))
    await waitFor(() => expect(calls.left).toBe(1))
  })

  test('所有者は退出できない', async () => {
    setup('owner')
    await openMenu()
    expect(screen.queryByRole('button', { name: 'この文書から退出' })).toBeNull()
  })

  test('状態ピルと参加者が出る', () => {
    setup('owner')
    expect(screen.getByText('同期済み · 12:34')).toBeDefined()
    expect(screen.getByRole('button', { name: '参加者 1 人' })).toBeDefined()
  })
})
