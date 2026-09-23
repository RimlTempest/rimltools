import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok } from '@noter/contract'
import type { ShareToken, UserId } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import type { MemberSummary, ShareLinkView } from '../contract/document.ts'
import { documentId, shareToken, userId } from '../core/tests/fixtures.ts'
import { ShareDialog } from './share-dialog.tsx'
import type { ShareActions } from './share-dialog.tsx'

afterEach(cleanup)

const OWNER = userId('1')
const FRIEND = userId('2')

const USER: Actor = { kind: 'user', userId: OWNER, displayName: '山田' }
const GUEST: Actor = {
  kind: 'guest',
  userId: OWNER,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-06T00:00:00.000Z'),
}

const LINK: ShareLinkView = {
  token: shareToken('1'),
  documentId: documentId('1'),
  role: 'viewer',
  createdAt: new Date('2026-09-06T00:00:00.000Z'),
  expiresAt: new Date('2026-12-05T00:00:00.000Z'),
}

const MEMBERS: readonly MemberSummary[] = [
  { userId: OWNER, displayName: '山田', role: 'owner' },
  { userId: FRIEND, displayName: '佐藤', role: 'editor' },
]

const NO_LINKS: readonly ShareLinkView[] = []

const noopActions: ShareActions = {
  createLink: async () => ok(LINK),
  revokeLink: async () => ok(undefined),
  removeMember: async () => ok(undefined),
  changeMemberRole: async () => ok(undefined),
  copyText: async () => true,
}

const renderDialog = (props: Partial<Parameters<typeof ShareDialog>[0]> = {}) =>
  render(
    <ShareDialog
      open={true}
      onClose={() => {}}
      actor={USER}
      ownerId={OWNER}
      origin="https://noter.example"
      links={NO_LINKS}
      members={MEMBERS}
      actions={noopActions}
      {...props}
    />,
  )

describe('ShareDialog', () => {
  test('ダイアログにアクセシブル名がある', () => {
    const { container } = renderDialog()
    const dialog = container.querySelector('dialog')
    const labelledBy = dialog?.getAttribute('aria-labelledby') ?? ''
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe('共有')
  })

  test('開くとモーダルとして表示される', () => {
    const { container } = renderDialog()
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true)
  })

  test('権限はラジオで選ぶ', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: '閲覧のみ' })).toBeDefined()
    expect(screen.getByRole('radio', { name: '編集できる' })).toBeDefined()
  })

  /** ADR-0010: ゲスト owner は viewer リンクしか作れない。 */
  test('ゲスト owner には「編集できる」を出さず、理由を説明する', () => {
    renderDialog({ actor: GUEST })
    expect(screen.queryByRole('radio', { name: '編集できる' })).toBeNull()
    expect(screen.getByRole('radio', { name: '閲覧のみ' })).toBeDefined()
    expect(screen.getByText(/ゲストのままでは編集できる共有リンクを作れません/)).toBeDefined()
  })

  test('有効期限を選んでリンクを作成する', async () => {
    const created: { role: string; expiresInDays: number | undefined }[] = []
    renderDialog({
      actions: {
        ...noopActions,
        createLink: async (input) => {
          created.push({ role: input.role, expiresInDays: input.expiresInDays })
          return ok(LINK)
        },
      },
    })

    await userEvent.click(screen.getByRole('radio', { name: '閲覧のみ' }))
    await userEvent.selectOptions(screen.getByLabelText('有効期限'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'リンクを作成' }))

    await waitFor(() => expect(created).toEqual([{ role: 'viewer', expiresInDays: 7 }]))
  })

  test('無期限も選べる', async () => {
    const created: (number | undefined)[] = []
    renderDialog({
      actions: {
        ...noopActions,
        createLink: async (input) => {
          created.push(input.expiresInDays)
          return ok(LINK)
        },
      },
    })

    await userEvent.selectOptions(screen.getByLabelText('有効期限'), 'unlimited')
    await userEvent.click(screen.getByRole('button', { name: 'リンクを作成' }))
    await waitFor(() => expect(created).toEqual([undefined]))
  })

  test('リンクが無いことを文言で伝える', () => {
    renderDialog()
    expect(screen.getByText(/有効なリンクはまだありません/)).toBeDefined()
  })

  test('リンクは URL・権限・期限を出し、コピーできる', async () => {
    const copied: string[] = []
    renderDialog({
      links: [LINK],
      actions: {
        ...noopActions,
        copyText: async (text) => {
          copied.push(text)
          return true
        },
      },
    })

    expect(screen.getByText(`https://noter.example/s/${LINK.token}`)).toBeDefined()
    expect(screen.getByText('2026/12/05 まで')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: '閲覧のみのリンクをコピー' }))
    await waitFor(() => expect(copied).toEqual([`https://noter.example/s/${LINK.token}`]))
    expect(screen.getByText('コピーしました')).toBeDefined()
  })

  test('無期限のリンクは「無期限」と出す', () => {
    renderDialog({ links: [{ ...LINK, expiresAt: undefined }] })
    const list = screen.getByRole('list', { name: '有効なリンク' })
    expect(within(list).getByText('無期限')).toBeDefined()
  })

  /** AAA 3.3.6: 取り消せない操作は確認を挟む。 */
  test('失効は確認してから実行する', async () => {
    const revoked: ShareToken[] = []
    renderDialog({
      links: [LINK],
      actions: {
        ...noopActions,
        revokeLink: async (token) => {
          revoked.push(token)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '閲覧のみのリンクを失効' }))
    expect(revoked).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '失効する' }))
    await waitFor(() => expect(revoked).toEqual([LINK.token]))
  })

  test('参加者を権限つきで並べる', () => {
    renderDialog()
    const list = screen.getByRole('list', { name: '参加者' })
    expect(within(list).getByText('佐藤')).toBeDefined()
    expect(within(list).getByText('編集できる')).toBeDefined()
  })

  test('所有者には「外す」を出さない', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: '山田さんを外す' })).toBeNull()
  })

  test('参加者を外すのは確認してから', async () => {
    const removed: UserId[] = []
    renderDialog({
      actions: {
        ...noopActions,
        removeMember: async (id) => {
          removed.push(id)
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '佐藤さんを外す' }))
    expect(removed).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '外す' }))
    await waitFor(() => expect(removed).toEqual([FRIEND]))
  })

  test('「閲覧のみにする」で権限を下げる', async () => {
    const changed: [UserId, string][] = []
    renderDialog({
      actions: {
        ...noopActions,
        changeMemberRole: async (id, role) => {
          changed.push([id, role])
          return ok(undefined)
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '佐藤さんを閲覧のみにする' }))
    await waitFor(() => expect(changed).toEqual([[FRIEND, 'viewer']]))
  })

  test('すでに閲覧のみの参加者には「閲覧のみにする」を出さない', () => {
    renderDialog({
      members: [
        { userId: OWNER, displayName: '山田', role: 'owner' },
        { userId: FRIEND, displayName: '佐藤', role: 'viewer' },
      ],
    })
    expect(screen.queryByRole('button', { name: '佐藤さんを閲覧のみにする' })).toBeNull()
  })
})
