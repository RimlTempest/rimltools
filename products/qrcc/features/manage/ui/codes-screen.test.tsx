import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RandomBytes } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import { makeCreateShareDraft } from '@qrcc/manage/core'
import type { ManageDeps } from './manage-deps.ts'
import { CodesScreen } from './codes-screen.tsx'
import {
  expectOk,
  fixedNewCodeId,
  fixedNewFolderId,
  folder,
  makeFakeApi,
  savedCode,
  summaryOf,
} from './testing-fakes.ts'
import { parseUserId } from '@qrcc/contract'

afterEach(cleanup)

const userId = expectOk(parseUserId('usr_0123456789abcdefghjkmnpq'))
const guest: Actor = {
  kind: 'guest',
  userId,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
}

const randomBytes: RandomBytes = (byteLength) => new Uint8Array(byteLength).fill(7)

const first = savedCode('pq', '在庫ラベル')
const second = savedCode('pr', '棚札')

const setup = (
  over: {
    readonly actor?: Actor
    readonly items?: readonly ReturnType<typeof summaryOf>[]
    readonly nextCursor?: string
    readonly folders?: readonly ReturnType<typeof folder>[]
  } = {},
) => {
  const fake = makeFakeApi({
    page: { items: over.items ?? [summaryOf(first)], nextCursor: over.nextCursor },
    folders: over.folders ?? [],
    detail: { code: first, shares: [] },
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
  render(<CodesScreen actor={over.actor ?? guest} deps={deps} />)
  return { fake, copied }
}

const methods = (fake: ReturnType<typeof makeFakeApi>) => fake.calls.map((call) => call.method)

describe('未サインインのとき', () => {
  test('保存にはサインインが必要だと案内し、サインインへ導く', async () => {
    const fake = makeFakeApi({})
    render(
      <CodesScreen
        actor={{ kind: 'visitor' }}
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
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
    expect(screen.getByText(/サインインが必要/)).toBeDefined()
    expect(screen.getByRole('link', { name: /サインイン/ })).toBeDefined()
    // 生成と読み取りは従来どおり使えることも伝える（ADR-0004）
    expect(screen.getByText(/生成と読み取り/)).toBeDefined()
  })

  test('一覧を取りに行かない', async () => {
    const fake = makeFakeApi({})
    render(
      <CodesScreen
        actor={{ kind: 'visitor' }}
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
    await waitFor(() => expect(screen.getByText(/サインインが必要/)).toBeDefined())
    expect(fake.calls).toHaveLength(0)
  })
})

describe('一覧', () => {
  test('表として読み上げられる（caption と行見出しがある）', async () => {
    setup()
    const table = await screen.findByRole('table')
    expect(table).toBeDefined()
    expect(screen.getByRole('rowheader', { name: '在庫ラベル' })).toBeDefined()
    expect(screen.getByRole('columnheader', { name: /名前/ })).toBeDefined()
  })

  test('保存が 1 件もないときは、その旨と次の一歩を示す', async () => {
    setup({ items: [] })
    expect(await screen.findByText(/まだ保存したコードはありません/)).toBeDefined()
  })

  test('既定は更新が新しい順', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    expect(fake.calls[0]?.payload).toMatchObject({ sort: 'updated_desc' })
  })

  test('列見出しを押すと並べ替えが変わり、aria-sort も変わる', async () => {
    const { fake } = setup()
    const nameHeader = await screen.findByRole('columnheader', { name: /名前/ })
    expect(nameHeader.getAttribute('aria-sort')).toBe('none')

    await userEvent.click(screen.getByRole('button', { name: /名前/ }))
    await waitFor(() => expect(nameHeader.getAttribute('aria-sort')).toBe('ascending'))
    expect(fake.calls.at(-1)?.payload).toMatchObject({ sort: 'name_asc' })

    await userEvent.click(screen.getByRole('button', { name: /名前/ }))
    await waitFor(() => expect(nameHeader.getAttribute('aria-sort')).toBe('descending'))
  })

  test('名前で検索できる', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    await userEvent.type(screen.getByRole('searchbox', { name: '名前で検索' }), '棚')
    await userEvent.click(screen.getByRole('button', { name: '検索する' }))
    await waitFor(() => expect(fake.calls.at(-1)?.payload).toMatchObject({ query: '棚' }))
  })

  test('次のページがあるときだけ読み足せる', async () => {
    const { fake } = setup({ nextCursor: 'next' })
    await screen.findByRole('table')
    const more = screen.getByRole('button', { name: '次のページを読み込む' })

    fake.setPage({ items: [summaryOf(second)], nextCursor: undefined })
    await userEvent.click(more)

    await waitFor(() => expect(screen.getByRole('rowheader', { name: '棚札' })).toBeDefined())
    expect(screen.queryByRole('button', { name: '次のページを読み込む' })).toBeNull()
  })
})

describe('新しいコードを保存する', () => {
  test('名前と内容を入れると保存され、一覧を読み直す', async () => {
    const { fake } = setup()
    await screen.findByRole('table')

    await userEvent.type(screen.getByLabelText('名前'), '新しいラベル')
    await userEvent.clear(screen.getByLabelText('リンク先の URL'))
    await userEvent.type(screen.getByLabelText('リンク先の URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(methods(fake)).toContain('codes.create'))
    const created = fake.calls.find((call) => call.method === 'codes.create')
    expect(created?.payload).toMatchObject({ idempotencyKey: 'key-1' })
  })

  test('名前が空なら保存せず、理由を伝える', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('名前'))
    expect(methods(fake)).not.toContain('codes.create')
  })
})

describe('削除', () => {
  test('確認を挟む。キャンセルすれば消えない', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: '「在庫ラベル」を削除' }))

    expect(screen.getByRole('heading', { name: 'コードを削除しますか？' })).toBeDefined()
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))

    expect(methods(fake)).not.toContain('codes.delete')
    expect(screen.getByRole('rowheader', { name: '在庫ラベル' })).toBeDefined()
  })

  test('削除すると一覧から消え、取り消せる（AAA 3.3.6）', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: '「在庫ラベル」を削除' }))
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(methods(fake)).toContain('codes.delete'))
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: '在庫ラベル' })).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: '削除を取り消す' }))
    await waitFor(() => expect(methods(fake)).toContain('codes.create'))

    // 同じ id で作り直す（共有リンクの URL が変わらない）
    const restored = fake.calls.find((call) => call.method === 'codes.create')
    expect(restored?.payload).toMatchObject({ draft: { id: first.id } })
    await waitFor(() => expect(screen.getByRole('rowheader', { name: '在庫ラベル' })).toBeDefined())
  })
})

describe('フォルダ', () => {
  test('フォルダで絞り込める', async () => {
    const work = folder('仕事')
    const { fake } = setup({ folders: [work] })
    await screen.findByRole('table')
    await userEvent.selectOptions(screen.getByLabelText('フォルダで絞り込む'), String(work.id))
    await waitFor(() => expect(fake.calls.at(-1)?.payload).toMatchObject({ folderId: work.id }))
  })

  test('フォルダを作れる', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    await userEvent.type(screen.getByLabelText('新しいフォルダの名前'), '仕事')
    await userEvent.click(screen.getByRole('button', { name: 'フォルダを作る' }))
    await waitFor(() => expect(methods(fake)).toContain('folders.create'))
  })
})

describe('失敗したとき', () => {
  test('理由を読み上げ領域に出す', async () => {
    const { fake } = setup()
    await screen.findByRole('table')
    fake.failWith({ kind: 'unavailable', detail: 'internal' })

    await userEvent.type(screen.getByLabelText('名前'), 'テスト')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('通信できません'))
  })
})
