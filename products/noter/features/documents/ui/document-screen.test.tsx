import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import type { DocumentHeader, MemberSummary, ShareLinkView } from '../contract/document.ts'
import { documentId, shareToken, userId } from '../core/tests/fixtures.ts'
import { DocumentScreen } from './document-screen.tsx'
import type { ShareActions } from './share-dialog.tsx'

afterEach(cleanup)

const OWNER = userId('1')
const FRIEND = userId('2')
const USER: Actor = { kind: 'user', userId: OWNER, displayName: '山田' }

const DOCUMENT: DocumentHeader = {
  id: documentId('1'),
  ownerId: OWNER,
  title: '設計メモ',
  kind: 'markdown',
  updatedAt: new Date('2026-09-06T03:04:05.000Z'),
}

const MEMBERS: readonly MemberSummary[] = [{ userId: OWNER, displayName: '山田', role: 'owner' }]
const NO_LINKS: readonly ShareLinkView[] = []

const shareActions: ShareActions = {
  createLink: async () =>
    ok({
      token: shareToken('1'),
      documentId: DOCUMENT.id,
      role: 'viewer',
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      expiresAt: undefined,
    }),
  revokeLink: async () => ok(undefined),
  removeMember: async () => ok(undefined),
  changeMemberRole: async () => ok(undefined),
  copyText: async () => true,
}

const actions = {
  rename: async (title: string) => ok(title),
  remove: async () => ok(undefined),
  leave: async () => ok(undefined),
}

const renderScreen = (props: Partial<Parameters<typeof DocumentScreen>[0]> = {}) =>
  render(
    <DocumentScreen
      actor={USER}
      document={DOCUMENT}
      actorRole="owner"
      members={MEMBERS}
      links={NO_LINKS}
      origin="https://noter.example"
      actions={actions}
      shareActions={shareActions}
      {...props}
    />,
  )

describe('DocumentScreen', () => {
  test('h1 は文書のタイトル 1 つだけ', () => {
    renderScreen()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('設計メモ')
  })

  test('種別と自分の権限を出す', () => {
    renderScreen()
    expect(screen.getByText('Markdown')).toBeDefined()
    expect(screen.getByText('あなたの権限: 所有者')).toBeDefined()
  })

  test('エディタが未実装であることを伝える', () => {
    renderScreen()
    expect(screen.getByText(/エディタは準備中です/)).toBeDefined()
  })

  test('raw への導線がある', () => {
    renderScreen()
    expect(
      screen.getByRole('link', { name: 'この文書の本文をそのまま表示する' }).getAttribute('href'),
    ).toBe(`/d/${DOCUMENT.id}/raw`)
  })

  test('editor 以上は表題を変更できる', async () => {
    const renamed: string[] = []
    renderScreen({
      actorRole: 'editor',
      actions: {
        ...actions,
        rename: async (title) => {
          renamed.push(title)
          return ok(title)
        },
      },
    })

    await userEvent.clear(screen.getByLabelText('文書のタイトル'))
    await userEvent.type(screen.getByLabelText('文書のタイトル'), '新しい表題')
    await userEvent.click(screen.getByRole('button', { name: '表題を変更' }))
    await waitFor(() => expect(renamed).toEqual(['新しい表題']))
  })

  test('viewer には表題の入力を出さず、理由を書く', () => {
    renderScreen({ actorRole: 'viewer' })
    expect(screen.queryByLabelText('文書のタイトル')).toBeNull()
    expect(screen.getByText(/閲覧のみの権限です/)).toBeDefined()
  })

  test('共有ボタンは owner にだけ出る', () => {
    renderScreen()
    expect(screen.getByRole('button', { name: '共有' })).toBeDefined()
    cleanup()
    renderScreen({ actorRole: 'editor' })
    expect(screen.queryByRole('button', { name: '共有' })).toBeNull()
  })

  test('共有ボタンでダイアログが開く', async () => {
    const { container } = renderScreen()
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '共有' }))
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true)
  })

  /** AAA 3.3.6: 取り消せない操作は確認を挟む。 */
  test('削除は確認してから実行する', async () => {
    const removed: boolean[] = []
    renderScreen({
      actions: {
        ...actions,
        remove: async () => {
          removed.push(true)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: 'この文書を削除' }))
    expect(removed).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(removed).toEqual([true]))
  })

  test('owner には退出を出さない（誰も管理できなくなる）', () => {
    renderScreen()
    expect(screen.queryByRole('button', { name: 'この文書から退出' })).toBeNull()
  })

  test('メンバーは退出できる（確認あり）', async () => {
    const left: boolean[] = []
    renderScreen({
      actorRole: 'viewer',
      document: { ...DOCUMENT, ownerId: FRIEND },
      actions: {
        ...actions,
        leave: async () => {
          left.push(true)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: 'この文書から退出' }))
    await userEvent.click(screen.getByRole('button', { name: '退出する' }))
    await waitFor(() => expect(left).toEqual([true]))
  })

  test('editor は削除できない', () => {
    renderScreen({ actorRole: 'editor' })
    expect(screen.queryByRole('button', { name: 'この文書を削除' })).toBeNull()
  })
})
