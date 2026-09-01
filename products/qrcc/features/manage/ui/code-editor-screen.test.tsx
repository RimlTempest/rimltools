import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RandomBytes } from '@qrcc/contract'
import { parseShareToken, parseUserId } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import { makeCreateShareDraft } from '@qrcc/manage/core'
import { CodeEditorScreen } from './code-editor-screen.tsx'
import type { ManageDeps } from './manage-deps.tsx'
import {
  expectOk,
  fixedNewCodeId,
  fixedNewFolderId,
  makeFakeApi,
  savedCode,
} from './testing-fakes.ts'

afterEach(cleanup)

const userId = expectOk(parseUserId('usr_0123456789abcdefghjkmnpq'))
const guest: Actor = {
  kind: 'guest',
  userId,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
}
const user: Actor = { kind: 'user', userId, displayName: '利用者' }

const randomBytes: RandomBytes = (byteLength) => new Uint8Array(byteLength).fill(7)
const code = savedCode('pq', '在庫ラベル')
const token = expectOk(parseShareToken('abcdefghjkmnpqrstvwxyz0123456789'))

const setup = (over: { readonly actor?: Actor; readonly shares?: boolean } = {}) => {
  const fake = makeFakeApi({
    detail: {
      code,
      shares: over.shares
        ? [
            {
              token,
              codeId: code.id,
              permission: 'view',
              expiresAt: new Date('2026-10-01T00:00:00.000Z'),
              createdAt: new Date('2026-09-02T00:00:00.000Z'),
              revokedAt: undefined,
            },
          ]
        : [],
    },
  })
  const copied: string[] = []
  const deps: ManageDeps = {
    api: fake.api,
    newCodeId: fixedNewCodeId,
    newFolderId: fixedNewFolderId,
    newIdempotencyKey: () => 'key-1',
    createShareDraft: makeCreateShareDraft({
      now: () => new Date('2026-09-01T00:00:00.000Z'),
      randomBytes,
    }),
    origin: 'https://qrcc.riml4i.com',
    copyText: async (text) => {
      copied.push(text)
      return true
    },
  }
  render(<CodeEditorScreen actor={over.actor ?? user} codeId={code.id} deps={deps} />)
  return { fake, copied }
}

const methods = (fake: ReturnType<typeof makeFakeApi>) => fake.calls.map((call) => call.method)

describe('編集', () => {
  test('開くと保存されている名前と内容が入っている', async () => {
    setup()
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )
    expect(screen.getByLabelText<HTMLInputElement>('リンク先の URL').value).toBe(
      'https://qrcc.riml4i.com',
    )
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
  })

  test('保存すると全置換で上書きされる', async () => {
    const { fake } = setup()
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )

    await userEvent.clear(screen.getByLabelText('名前'))
    await userEvent.type(screen.getByLabelText('名前'), '棚札')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(methods(fake)).toContain('codes.update'))
    const saved = fake.calls.find((call) => call.method === 'codes.update')
    expect(saved?.payload).toMatchObject({ id: code.id })
  })

  test('名前を空にすると保存せず、理由を伝える', async () => {
    const { fake } = setup()
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )

    await userEvent.clear(screen.getByLabelText('名前'))
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('名前'))
    expect(methods(fake)).not.toContain('codes.update')
  })

  test('見つからないときは理由を伝える', async () => {
    const fake = makeFakeApi({ detail: { code, shares: [] } })
    fake.failWith({ kind: 'not_found', resource: 'code' })
    render(
      <CodeEditorScreen
        actor={user}
        codeId={code.id}
        deps={{
          api: fake.api,
          newCodeId: fixedNewCodeId,
          newFolderId: fixedNewFolderId,
          newIdempotencyKey: () => 'key-1',
          createShareDraft: makeCreateShareDraft({
            now: () => new Date('2026-09-01T00:00:00.000Z'),
            randomBytes,
          }),
          origin: 'https://qrcc.riml4i.com',
          copyText: async () => true,
        }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('見つかりません'))
  })
})

describe('共有リンク', () => {
  test('作ると、そのまま開ける URL が出る', async () => {
    const { fake } = setup()
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )

    await userEvent.click(screen.getByRole('button', { name: '共有リンクを作る' }))
    await waitFor(() => expect(methods(fake)).toContain('shares.create'))
    expect(await screen.findByText(/https:\/\/qrcc\.riml4i\.com\/shared\//)).toBeDefined()

    const created = fake.calls.find((call) => call.method === 'shares.create')
    expect(created?.payload).toMatchObject({ idempotencyKey: 'key-1' })
  })

  test('作った URL をコピーできる', async () => {
    const { copied } = setup({ shares: true })
    const copy = await screen.findByRole('button', { name: /リンクをコピー/ })
    await userEvent.click(copy)
    await waitFor(() => expect(copied[0]).toContain('/shared/abcdefghjkmnpqrstvwxyz0123456789'))
  })

  test('取り消せる', async () => {
    const { fake } = setup({ shares: true })
    const revoke = await screen.findByRole('button', { name: /リンクを取り消す/ })
    await userEvent.click(revoke)
    await waitFor(() => expect(methods(fake)).toContain('shares.revoke'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /リンクを取り消す/ })).toBeNull(),
    )
  })

  /** ゲストの制約は選ぶ前に伝える（後から断るのは体験が悪い）。 */
  test('ゲストには編集できるリンクを作れないと先に伝える', async () => {
    setup({ actor: guest })
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )
    expect(screen.getByText(/ゲストのままでは/)).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>('編集もできる').disabled).toBe(true)
  })

  test('ゲストが期限なしを選ぶと、理由を添えて断る', async () => {
    const { fake } = setup({ actor: guest })
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )

    await userEvent.selectOptions(screen.getByLabelText('共有リンクの期限'), 'forever')
    await userEvent.click(screen.getByRole('button', { name: '共有リンクを作る' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('期限なし'))
    expect(methods(fake)).not.toContain('shares.create')
  })
})
