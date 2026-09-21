import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok } from '@noter/contract'
import type { DocumentId } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import type { DocumentSummary } from '../contract/document.ts'
import { documentId, userId } from '../core/tests/fixtures.ts'
import { HomeScreen } from './home-screen.tsx'

afterEach(cleanup)

const VISITOR: Actor = { kind: 'visitor' }
const GUEST: Actor = {
  kind: 'guest',
  userId: userId('1'),
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-06T00:00:00.000Z'),
}
const USER: Actor = { kind: 'user', userId: userId('1'), displayName: '山田' }

const SUMMARY: DocumentSummary = {
  id: documentId('1'),
  title: '設計メモ',
  kind: 'markdown',
  role: 'owner',
  updatedAt: new Date('2026-09-06T03:04:05.000Z'),
}

const NO_DOCUMENTS: readonly DocumentSummary[] = []

const noopActions = { remove: async () => ok(undefined) }

const renderHome = (
  props: Partial<Parameters<typeof HomeScreen>[0]> = {},
): ReturnType<typeof render> =>
  render(
    <HomeScreen
      actor={USER}
      documents={NO_DOCUMENTS}
      actions={noopActions}
      guestNoticeDismissed={true}
      {...props}
    />,
  )

describe('HomeScreen', () => {
  test('h1 が 1 つだけある', () => {
    renderHome()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('文書一覧')
  })

  test('種別ごとの作成ボタンが 4 つある', () => {
    renderHome()
    for (const label of ['Markdown で始める', 'YAML で始める', 'TOML で始める', 'JSON で始める']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }
  })

  /** JS が落ちていても作成できるよう、素の form で POST する。 */
  test('作成は /new への POST フォームで行う', () => {
    const { container } = renderHome()
    const form = container.querySelector('form[action="/new"]')
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post')
    expect(screen.getByRole('button', { name: 'Markdown で始める' }).getAttribute('value')).toBe(
      'markdown',
    )
  })

  test('文書が無いことを文言で伝える', () => {
    renderHome()
    expect(screen.getByText(/まだ文書がありません/)).toBeDefined()
  })

  test('一覧はタイトル・種別・権限・最終更新を出す', () => {
    renderHome({ documents: [SUMMARY] })
    expect(screen.getByRole('link', { name: '設計メモ' }).getAttribute('href')).toBe(
      `/d/${SUMMARY.id}`,
    )
    expect(screen.getByText('Markdown')).toBeDefined()
    expect(screen.getByText('所有者')).toBeDefined()
    // ホバーしなくても絶対時刻が読める（docs/design/ux.md §4.1）
    const time = screen.getByText('2026/09/06 12:04')
    expect(time.getAttribute('datetime')).toBe('2026-09-06T03:04:05.000Z')
  })

  test('visitor には説明とログインへの導線を出す', () => {
    renderHome({ actor: VISITOR })
    expect(screen.getByRole('link', { name: 'Google でログイン' }).getAttribute('href')).toBe(
      '/sign-in',
    )
  })

  test('ログイン済みにはログインへの導線を出さない', () => {
    renderHome()
    expect(screen.queryByRole('link', { name: 'Google でログイン' })).toBeNull()
  })

  test('ゲストには端末に紐づく注意を出し、消せる', async () => {
    const dismissed: boolean[] = []
    renderHome({
      actor: GUEST,
      guestNoticeDismissed: false,
      onDismissGuestNotice: () => dismissed.push(true),
    })

    expect(screen.getByRole('complementary', { name: 'ゲスト利用の案内' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'この案内を閉じる' }))
    expect(dismissed).toEqual([true])
    expect(screen.queryByRole('complementary', { name: 'ゲスト利用の案内' })).toBeNull()
  })

  test('ログイン済みにはゲスト向けの注意を出さない', () => {
    renderHome({ guestNoticeDismissed: false })
    expect(screen.queryByRole('complementary', { name: 'ゲスト利用の案内' })).toBeNull()
  })

  /** AAA 3.3.6: 取り消せない操作は確認を挟む。 */
  test('削除は確認してから実行する', async () => {
    const removed: DocumentId[] = []
    renderHome({
      documents: [SUMMARY],
      actions: {
        remove: async (id) => {
          removed.push(id)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '「設計メモ」を削除' }))
    expect(removed).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(removed).toEqual([SUMMARY.id]))
  })

  test('確認をやめると削除しない', async () => {
    const removed: DocumentId[] = []
    renderHome({
      documents: [SUMMARY],
      actions: {
        remove: async (id) => {
          removed.push(id)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '「設計メモ」を削除' }))
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(removed).toEqual([])
    expect(screen.getByRole('button', { name: '「設計メモ」を削除' })).toBeDefined()
  })

  test('リンク文言だけで行き先が分かる（AAA 2.4.9）', () => {
    renderHome({ actor: VISITOR, documents: [SUMMARY] })
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(/^(こちら|詳細|もっと見る|ここ)$/)
    }
  })

  test('文書へのリンクの描画方法を差し替えられる（ルータに依存しない）', () => {
    renderHome({
      documents: [SUMMARY],
      renderDocumentLink: ({ title }) => <a href="/custom">{title}</a>,
    })
    expect(screen.getByRole('link', { name: '設計メモ' }).getAttribute('href')).toBe('/custom')
  })
})
