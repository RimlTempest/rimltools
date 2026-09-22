import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import type { PrintRenderFn } from './print-screen.tsx'
import { PrintScreen } from './print-screen.tsx'

afterEach(cleanup)

const response = (content: string): RenderResponse => ({
  body: `<svg role="img" aria-label="QRコード: ${content}"><title>${content}</title></svg>`,
  content_type: 'image/svg+xml',
  width: 120,
  height: 120,
  description: `テキスト: ${content}`,
  warnings: [],
})

/** 生成の依頼を記録しつつ、その場で答えを返す。wasm もサーバも要らない。 */
const recording = () => {
  const requests: RenderRequest[] = []
  const fn: PrintRenderFn = async (request) => {
    requests.push(request)
    const content = request.payload.kind === 'text' ? request.payload.text : ''
    return { ok: true, value: response(content) }
  }
  return { fn, requests }
}

/** wasm が読めない環境の代わり。 */
const failingRender: PrintRenderFn = async () => ({
  ok: false,
  error: { kind: 'unavailable', detail: 'wasm_unavailable' },
})

const setup = () => {
  const { fn, requests } = recording()
  const printed: number[] = []
  render(<PrintScreen render={fn} print={() => printed.push(1)} debounceMs={0} />)
  return { requests, printed }
}

/** プレビューに並んだラベル（空きセルを除く）。 */
const labels = () => screen.getAllByRole('img')

/** 貼り付けで入れる。1 文字ずつ打つと、その回数だけ生成が走ってしまう。 */
const fillCodes = async (text: string) => {
  const field = screen.getByLabelText('印刷するコード')
  await userEvent.clear(field)
  await userEvent.paste(text)
}

describe('PrintScreen', () => {
  test('主要な設定がラベルで取得できる', () => {
    setup()
    expect(screen.getByLabelText('ラベル台紙')).toBeDefined()
    expect(screen.getByLabelText('印刷を始めるセル')).toBeDefined()
    expect(screen.getByLabelText('1 つのコードあたりの枚数')).toBeDefined()
    expect(screen.getByLabelText('印刷するコード')).toBeDefined()
    expect(screen.getByRole('group', { name: 'ラベルに出す文字' })).toBeDefined()
  })

  test('台紙ごとに寸法と面数の説明が出る', () => {
    setup()
    expect(screen.getAllByText(/70 × 33.9mm/).length).toBeGreaterThan(0)
  })

  test('台紙を変えると説明も入れ替わる', async () => {
    setup()
    await userEvent.selectOptions(screen.getByLabelText('ラベル台紙'), 'a4-65-38.1x21.2')
    await waitFor(() => expect(screen.getAllByText(/38.1 × 21.2mm/).length).toBeGreaterThan(0))
  })

  test('入力した内容がブラウザ側の生成に渡る', async () => {
    const { requests } = setup()
    await fillCodes('https://example.com')
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    const last = requests.at(-1)
    expect(last?.payload).toEqual({ kind: 'text', text: 'https://example.com' })
    expect(last?.symbology.kind).toBe('qr')
  })

  /** 同じ内容を何枚刷っても、生成は 1 回でよい。 */
  test('同じ内容は 1 度しか生成しない', async () => {
    const { requests } = setup()
    await fillCodes('a\na\na')
    await waitFor(() =>
      expect(
        requests.filter(
          (request) => request.payload.kind === 'text' && request.payload.text === 'a',
        ),
      ).toHaveLength(1),
    )
  })

  test('枚数を増やすとラベルもその数だけ並ぶ', async () => {
    setup()
    await fillCodes('a')
    await waitFor(() => expect(labels()).toHaveLength(1))
    const copies = screen.getByLabelText('1 つのコードあたりの枚数')
    await userEvent.clear(copies)
    await userEvent.type(copies, '3')
    await waitFor(() => expect(labels()).toHaveLength(3))
  })

  test('使いかけの台紙に合わせて、開始セルまでを空きにする', async () => {
    setup()
    await fillCodes('a')
    await waitFor(() => expect(labels()).toHaveLength(1))
    const start = screen.getByLabelText('印刷を始めるセル')
    await userEvent.clear(start)
    await userEvent.type(start, '5')
    // 5 番目のセル（2 行 2 列）に入る
    await waitFor(() => expect(screen.getByText('2 行 2 列')).toBeDefined())
    expect(screen.getAllByText(/空き/).length).toBeGreaterThan(0)
  })

  test('開始セルが台紙の面数を超えたら、その場で理由を伝える', async () => {
    setup()
    const start = screen.getByLabelText('印刷を始めるセル')
    await userEvent.clear(start)
    await userEvent.type(start, '99')
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('開始セル'))
  })

  test('ページ数と枚数が文章でも分かる', async () => {
    setup()
    await fillCodes('a')
    const copies = screen.getByLabelText('1 つのコードあたりの枚数')
    await userEvent.clear(copies)
    await userEvent.type(copies, '25')
    await waitFor(() => expect(screen.getByText(/全 2 ページ/)).toBeDefined())
  })

  /** 画像だけで提供しない（WCAG 1.1.1）。 */
  test('印刷するものが一覧でも確認できる', async () => {
    setup()
    await fillCodes('会議室 A\thttps://example.com/a')
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('listitem')
          .some((item) => within(item).queryByText('https://example.com/a') !== null),
      ).toBe(true),
    )
    expect(screen.getAllByText(/会議室 A/).length).toBeGreaterThan(0)
  })

  test('キャプションを「内容」にするとラベルに内容が出る', async () => {
    setup()
    await fillCodes('会議室 A\thttps://example.com/a')
    await userEvent.click(screen.getByRole('radio', { name: /^内容/ }))
    await waitFor(() => {
      const captions = screen.getAllByText('https://example.com/a', {
        selector: '.qrcc-print-label__caption',
      })
      expect(captions.length).toBeGreaterThan(0)
    })
  })

  test('キャプションを「なし」にするとラベルから文字が消える', async () => {
    setup()
    await fillCodes('会議室 A\thttps://example.com/a')
    await waitFor(() => expect(labels()).toHaveLength(1))
    await userEvent.click(screen.getByRole('radio', { name: /^なし/ }))
    await waitFor(() =>
      expect(document.querySelectorAll('.qrcc-print-label__caption')).toHaveLength(0),
    )
  })

  test('「共通の文字」を選んだときだけ、その入力欄が出る', async () => {
    setup()
    expect(screen.queryByLabelText('すべてのラベルに出す文字')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: /^共通の文字/ }))
    expect(screen.getByLabelText('すべてのラベルに出す文字')).toBeDefined()
  })

  test('印刷ボタンを押すと印刷を実行する', async () => {
    const { printed } = setup()
    await userEvent.click(screen.getByRole('button', { name: '印刷する' }))
    expect(printed).toHaveLength(1)
  })

  test('刷るものが無いときは印刷を実行しない', async () => {
    const { printed } = setup()
    await fillCodes(' ')
    await userEvent.click(screen.getByRole('button', { name: '印刷する' }))
    expect(printed).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('印刷するコード'))
  })

  test('生成に失敗したら、次にどうすればよいかを伝える', async () => {
    render(<PrintScreen render={failingRender} print={() => {}} debounceMs={0} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('生成できません'))
  })
})

/**
 * 区画が窓（Mado）として出ているか。
 *
 * 窓は「帯（header）＋ 本体」の 2 段で、見出しは帯の中に入る（riml-ds ADR-0014）。
 * section に見出しと中身を並べただけの板では、区画の直下に中身が出てしまい通らない。
 */
const expectWindow = (name: string) => {
  const region = screen.getByRole('region', { name })
  const heading = within(region).getByRole('heading', { name })
  const bar = region.firstElementChild
  expect(bar?.tagName).toBe('HEADER')
  expect(bar?.className).toBe('rd-window-bar')
  expect(bar?.contains(heading)).toBe(true)
  expect(region.children.length).toBe(2)
  expect(bar?.nextElementSibling?.className).toBe('rd-window-body')
}

describe('PrintScreen の区画', () => {
  test('印刷するものの一覧は窓として出る', async () => {
    setup()
    await fillCodes('https://example.com')
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
    expectWindow('印刷するものの一覧')
  })
})
