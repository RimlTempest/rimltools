import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RandomBytes } from '@qrcc/contract'
import { parseShareToken, parseUserId } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import type { RenderWarning } from '@qrcc/generate/contract'
import type { RenderFailure } from '@qrcc/generate/ui'
import { makeCreateShareDraft } from '@qrcc/manage/core'
import { CodeEditorScreen } from './code-editor-screen.tsx'
import type { ManageDeps } from './manage-deps.tsx'
import {
  expectOk,
  fixedNewCodeId,
  fixedNewFolderId,
  makeFakeApi,
  makeFakeRenderer,
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
  const renderer = makeFakeRenderer()
  render(
    <CodeEditorScreen
      actor={over.actor ?? user}
      codeId={code.id}
      deps={deps}
      renderPreview={renderer.render}
      previewDebounceMs={0}
    />,
  )
  return { fake, copied, renderer }
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
        renderPreview={makeFakeRenderer().render}
        previewDebounceMs={0}
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

/**
 * プレビューはブラウザ側の wasm で作る（docs/free-tier-budget.md）。
 * ここでは生成の中身ではなく「設定を触るたびに更新されること」と
 * 「読み上げ領域が問題だけを言うこと」を確かめる。
 */
const size = () => screen.getByLabelText('1 モジュールの大きさ')

describe('プレビュー', () => {
  /** 設定を 1 つ変えて、プレビューを作り直させる。 */
  const changeSetting = async (value: string) => {
    await userEvent.clear(size())
    await userEvent.type(size(), value)
  }

  test('開くと、保存されている設定のプレビューが出る', async () => {
    setup()
    expect(await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)).toBeDefined()
  })

  test('設定を変えると、保存しなくてもその場で作り直す', async () => {
    const { renderer } = setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)

    await userEvent.clear(screen.getByLabelText('リンク先の URL'))
    await userEvent.type(screen.getByLabelText('リンク先の URL'), 'https://example.com/1')

    expect(await screen.findByText(/URL: https:\/\/example\.com\/1/)).toBeDefined()
    expect(renderer.requests.at(-1)?.payload).toMatchObject({
      kind: 'url',
      url: 'https://example.com/1',
    })
  })

  test('名前が空でもプレビューは出す（名前はコードの絵に関係ない）', async () => {
    setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)

    await userEvent.clear(screen.getByLabelText('名前'))

    await waitFor(() => expect(screen.getByRole('figure')).toBeDefined())
    expect(screen.getByRole('status').textContent).toBe('')
  })

  test('プレビューのためにサーバへ問い合わせない（無料枠を使わない）', async () => {
    const { fake, renderer } = setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)
    await changeSetting('9')

    await waitFor(() => expect(renderer.requests.length).toBeGreaterThan(1))
    expect(methods(fake)).toEqual(['codes.get', 'folders.list'])
  })

  test('うまくいったことは読み上げない（ライブ更新でしゃべり続けないため）', async () => {
    setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  test('コントラストが低いときは警告するが、プレビューは止めない', async () => {
    const { renderer } = setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)

    const lowContrast: RenderWarning = { kind: 'low_contrast', ratio: 1.2, minimum: 3 }
    renderer.setWarnings([lowContrast])
    await changeSetting('9')

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('コントラスト'))
    expect(screen.getByText(/URL: https:\/\/qrcc\.riml4i\.com/)).toBeDefined()
  })

  test('生成できないときは理由を読み上げ領域に出す', async () => {
    const { renderer } = setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)

    const tooLong: RenderFailure = {
      kind: 'payload_too_long',
      symbology: 'EAN-13',
      max: 13,
      actual: 26,
    }
    renderer.failWith(tooLong)
    await changeSetting('9')

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('長すぎ'))
  })

  test('wasm が使えないときも、編集そのものは続けられると伝える', async () => {
    const { renderer } = setup()
    await screen.findByText(/URL: https:\/\/qrcc\.riml4i\.com/)

    renderer.failWith({ kind: 'unavailable', detail: 'wasm_unavailable' })
    await changeSetting('9')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('プレビューを表示できません'),
    )
    expect(screen.getByRole('button', { name: '保存する' })).toBeDefined()
  })
})

/**
 * 区画が窓（Mado）として出ているか。
 *
 * 窓は「帯（＝見出し）＋ 本体」の 2 段で、中身は本体の中に入る（riml-ds の `.rd-window`）。
 * section に見出しと中身を並べただけの板では、区画の直下に中身が出てしまい通らない。
 */
const expectWindow = (name: string) => {
  const region = screen.getByRole('region', { name })
  const heading = within(region).getByRole('heading', { name })
  expect(region.firstElementChild).toBe(heading)
  expect(region.children.length).toBe(2)
  expect(heading.nextElementSibling?.tagName).toBe('DIV')
}

describe('編集画面の区画', () => {
  test('題のある区画は窓として出る', async () => {
    setup()
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('在庫ラベル'),
    )
    expectWindow('内容と見た目')
    expectWindow('プレビュー')
    expectWindow('共有リンク')
  })
})
