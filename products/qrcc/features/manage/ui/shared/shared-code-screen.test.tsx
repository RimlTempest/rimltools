import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Result, ShareToken } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { Actor } from '@qrcc/auth/contract'
import type { RenderResponse } from '@qrcc/generate/contract'
import type { SharePreview } from '@qrcc/manage/contract'
import type { ManageFailure } from '@qrcc/manage/server'
import { expectOk, savedCode } from '../testing-fakes.ts'
import type { SharedCodeDeps } from './shared-code-screen.tsx'
import { SharedCodeScreen } from './shared-code-screen.tsx'
import { parseUserId } from '@qrcc/contract'

afterEach(cleanup)

const TOKEN = 'abcdefghjkmnpqrstvwxyz0123456789'

const CODE = savedCode('pq', '在庫ラベル')

const RESPONSE: RenderResponse = {
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
  content_type: 'image/svg+xml',
  width: 10,
  height: 10,
  description: 'https://qrcc.riml4i.com',
  warnings: [],
}

const visitor: Actor = { kind: 'visitor' }

const signedIn: Actor = {
  kind: 'user',
  userId: expectOk(parseUserId('usr_0123456789abcdefghjkmnpq')),
  displayName: 'りむ',
}

type Over = {
  readonly token?: string
  readonly actor?: Actor
  readonly preview?: Result<SharePreview, ManageFailure>
  readonly drawn?: boolean
}

const setup = (over: Over = {}) => {
  const asked: ShareToken[] = []
  const deps: SharedCodeDeps = {
    resolveShare: async (token) => {
      asked.push(token)
      return over.preview ?? ok({ permission: 'view', code: CODE })
    },
    render: async () =>
      over.drawn === false
        ? err({ kind: 'unavailable', detail: 'wasm を読み込めませんでした' })
        : ok(RESPONSE),
  }
  render(<SharedCodeScreen actor={over.actor ?? visitor} deps={deps} token={over.token ?? TOKEN} />)
  return { asked }
}

describe('共有リンクを開く', () => {
  test('コードの名前が見出しになり、内容はテキストでも読める', async () => {
    setup()

    expect(await screen.findByRole('heading', { level: 1, name: '在庫ラベル' })).toBeDefined()
    expect(screen.getByText(/https:\/\/qrcc\.riml4i\.com/)).toBeDefined()
  })

  test('サインインしていなくても開ける（サインインを求めない）', async () => {
    const { asked } = setup({ actor: visitor })

    await screen.findByRole('heading', { level: 1, name: '在庫ラベル' })
    expect(asked.map(String)).toEqual([TOKEN])
    expect(screen.queryByText(/サインインが必要/)).toBeNull()
  })

  test('SVG と PNG で保存できる', async () => {
    setup()

    await screen.findByRole('heading', { level: 1, name: '在庫ラベル' })
    expect(screen.getByRole('button', { name: 'SVG で保存' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'PNG で保存' })).toBeDefined()
  })

  test('自分でも作ってみる導線がある', async () => {
    setup()

    const link = await screen.findByRole('link', { name: /自分でコードを作る/ })
    expect(link.getAttribute('href')).toBe('/')
  })

  test('絵を描けなくても、名前と理由が読める', async () => {
    setup({ drawn: false })

    expect(await screen.findByRole('heading', { level: 1, name: '在庫ラベル' })).toBeDefined()
    expect(screen.getByText(/wasm を読み込めませんでした/)).toBeDefined()
  })
})

describe('共有画面の区画', () => {
  test('題のある区画は窓として出る', async () => {
    setup()

    await screen.findByRole('heading', { level: 1, name: '在庫ラベル' })
    for (const name of ['共有されたコード', 'このリンクでできること']) {
      const region = screen.getByRole('region', { name })
      const bar = region.firstElementChild
      expect(bar?.tagName).toBe('HEADER')
      expect(bar?.className).toBe('rd-window-bar')
      expect(within(region).getByRole('heading', { name }).className).toBe('rd-window-title')
      expect(bar?.nextElementSibling?.className).toBe('rd-window-body')
    }
  })
})

describe('このリンクでできること', () => {
  test('見るだけのリンクでは、編集の導線を出さない', async () => {
    setup({ preview: ok({ permission: 'view', code: CODE }) })

    expect(await screen.findByText(/見ることだけ/)).toBeDefined()
    expect(screen.queryByRole('link', { name: /編集/ })).toBeNull()
  })

  test('編集できるリンクでも、この画面では編集させない', async () => {
    setup({ preview: ok({ permission: 'edit', code: CODE }), actor: signedIn })

    expect(await screen.findByText(/この画面は見るためのもの/)).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存する' })).toBeNull()
  })

  test('編集できるリンクをサインイン済みで開くと、編集画面へ案内する', async () => {
    setup({ preview: ok({ permission: 'edit', code: CODE }), actor: signedIn })

    const link = await screen.findByRole('link', { name: /編集画面/ })
    expect(link.getAttribute('href')).toBe(`/codes/${CODE.id}`)
  })

  test('編集できるリンクでもサインインしていなければ、サインインへ案内する', async () => {
    setup({ preview: ok({ permission: 'edit', code: CODE }), actor: visitor })

    const link = await screen.findByRole('link', { name: /サインイン/ })
    expect(link.getAttribute('href')).toBe('/sign-in')
    expect(screen.queryByRole('link', { name: /編集画面/ })).toBeNull()
  })
})

describe('開けなかったとき', () => {
  test('トークンの形が違うなら、URL を確かめるよう案内する', async () => {
    setup({ token: 'こわれたトークン' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'この共有リンクは形が違います' }),
    ).toBeDefined()
    expect(screen.getByText(/途中で切れていないか/)).toBeDefined()
  })

  test('取り消された・存在しないリンクは、作り直しを頼むよう案内する', async () => {
    setup({ preview: err({ kind: 'not_found', resource: 'share' }) })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'この共有リンクは使えません' }),
    ).toBeDefined()
    expect(screen.getByText(/新しい共有リンクを作ってもらって/)).toBeDefined()
  })

  test('期限切れは期限切れだと伝える', async () => {
    setup({ preview: err({ kind: 'not_found', resource: 'share_expired' }) })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'この共有リンクは期限切れです' }),
    ).toBeDefined()
    expect(screen.getByText(/期限を過ぎました/)).toBeDefined()
  })

  test('どの失敗でも、自分で作る導線は残す', async () => {
    setup({ preview: err({ kind: 'unavailable', detail: 'internal' }) })

    await screen.findByRole('heading', { level: 1, name: '共有されたコードを開けませんでした' })
    expect(screen.getByRole('link', { name: /自分でコードを作る/ })).toBeDefined()
  })
})
