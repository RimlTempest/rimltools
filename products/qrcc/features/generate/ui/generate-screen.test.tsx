import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseHttpUrl, parsePhoneNumber } from '@qrcc/contract'
import type { RenderRequest, RenderResponse } from '../contract/index.ts'
import type { RenderFn } from './generate-screen.tsx'
import { GenerateScreen } from './generate-screen.tsx'

afterEach(cleanup)

/** `later` が `earlier` より後ろにあるか。前後どちらでもない場合は false。 */
const isFollowedBy = (earlier: Element | null, later: Element | null): boolean => {
  if (earlier === null || later === null) return false
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

const response = (over: Partial<RenderResponse> = {}): RenderResponse => ({
  body: '<svg role="img" aria-label="URL"><title>URL</title></svg>',
  content_type: 'image/svg+xml',
  width: 120,
  height: 120,
  description: 'URL: https://qrcc.riml4i.com',
  warnings: [],
  ...over,
})

const recording = (result: Awaited<ReturnType<RenderFn>>) => {
  const requests: RenderRequest[] = []
  const fn: RenderFn = async (request) => {
    requests.push(request)
    return result
  }
  return { fn, requests }
}

describe('GenerateScreen', () => {
  test('既定では h1 で始まる', () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    expect(screen.getByRole('heading', { level: 1, name: 'コードを作る' })).toBeDefined()
  })

  /**
   * トップページは生成と読み取りを 1 ページに並べる。h1 はページの主題に
   * 使うので、埋め込まれた側は 1 段下げる（AAA 2.4.10）。
   */
  test('埋め込むと h2 で始まり、下位の見出しも 1 段下がる', () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} headingLevel={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'コードを作る' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: '生成したコード' })).toBeDefined()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  /**
   * 設定を触りながら結果を見たいので、プレビューはフォームより**前**に置く。
   * 後ろだと、設定を変えるたびに長いフォームを越えてスクロールすることになる。
   */
  test('プレビューがフォームより前にある', async () => {
    const { fn } = recording({ ok: true, value: response() })
    const { container } = render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    await waitFor(() => expect(container.querySelector('.qrcc-code-preview')).not.toBeNull())
    const preview = container.querySelector('.qrcc-code-preview')
    const form = container.querySelector('form')
    expect(preview).not.toBeNull()
    expect(form).not.toBeNull()
    expect(isFollowedBy(preview, form)).toBe(true)
  })

  test('見出し「生成したコード」もフォームより前にある', () => {
    const { fn } = recording({ ok: true, value: response() })
    const { container } = render(<GenerateScreen render={fn} />)
    const heading = screen.getByRole('heading', { name: '生成したコード' })
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(isFollowedBy(heading, form)).toBe(true)
  })

  /**
   * 埋め込むと「生成したコード」は h3 になる。その中の「保存する」は
   * さらに 1 段下がらないと、親子が同じ高さの兄弟に見えてしまう。
   */
  test('埋め込み時に「保存する」が「生成したコード」の下位になる', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} headingLevel={2} />)
    // 節見出しは結果が無くても出るので、保存操作そのものが出るまで待つ
    const heading = await screen.findByRole('heading', { name: '保存する' })
    expect(screen.getByRole('heading', { name: '生成したコード' }).tagName).toBe('H3')
    expect(heading.tagName).toBe('H4')
  })

  test('単独ページでは「保存する」は h3 のまま', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    const heading = await screen.findByRole('heading', { name: '保存する' })
    expect(screen.getByRole('heading', { name: '生成したコード' }).tagName).toBe('H2')
    expect(heading.tagName).toBe('H3')
  })

  test('主要な設定がラベルで取得できる', () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    expect(screen.getByLabelText('リンク先の URL')).toBeDefined()
    expect(screen.getByLabelText('前景色')).toBeDefined()
    expect(screen.getByLabelText('背景色')).toBeDefined()
    expect(screen.getByRole('group', { name: '入れる内容' })).toBeDefined()
    expect(screen.getByRole('group', { name: 'コードの種類' })).toBeDefined()
  })

  /** 設定を触るたびにサーバへ投げると無料枠を使い切る。 */
  test('入力しただけでは生成しない', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.type(screen.getByLabelText('リンク先の URL'), 'x')
    expect(requests).toHaveLength(0)
  })

  test('生成するとフォームの内容が要求になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const url = parseHttpUrl('https://qrcc.riml4i.com')
    expect(url.ok).toBe(true)
    if (url.ok) expect(requests[0]?.payload).toEqual({ kind: 'url', url: url.value })
    expect(requests[0]?.symbology).toEqual({ kind: 'qr', ec: 'M' })
  })

  test('生成した内容がテキストでも表示される（WCAG 1.1.1）', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByText('URL: https://qrcc.riml4i.com')).toBeDefined())
  })

  test('完了が読み上げ領域に出る', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('生成しました'))
  })

  test('警告は生成を止めずに読み上げ領域と一覧に出る', async () => {
    const { fn } = recording({
      ok: true,
      value: response({ warnings: [{ kind: 'low_contrast', ratio: 1.26, minimum: 3 }] }),
    })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1.3:1'))
    expect(
      screen.getAllByRole('listitem').some((item) => item.textContent?.includes('コントラスト')),
    ).toBe(true)
  })

  test('入力が不正なときはサーバに投げず、その場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    // 内容が空のテキストは、サーバに聞くまでもなく不正
    await userEvent.click(screen.getByRole('radio', { name: 'テキスト' }))
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('内容'))
    expect(requests).toHaveLength(0)
  })

  test('生成エラーは次にどうすればよいかまで伝える', async () => {
    const { fn } = recording({
      ok: false,
      error: { kind: 'payload_too_long', symbology: 'QR', max: 2953, actual: 5000 },
    })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('誤り訂正レベル'))
  })

  test('内容の種類を変えると入力欄が入れ替わる', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Wi-Fi 設定' }))
    expect(screen.getByLabelText('ネットワーク名')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()
  })

  test('電話番号を選ぶと入力欄が電話番号になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '電話番号' }))
    expect(screen.getByLabelText('電話番号（国番号付き）')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('電話番号（国番号付き）'), '+819012345678')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const number = parsePhoneNumber('+819012345678')
    expect(number.ok).toBe(true)
    if (number.ok) expect(requests[0]?.payload).toEqual({ kind: 'tel', number: number.value })
  })

  test('電話番号が不正なときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '電話番号' }))
    await userEvent.type(screen.getByLabelText('電話番号'), '090-1234-5678')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('電話番号'))
    expect(requests).toHaveLength(0)
  })

  test('1D バーコードではモジュールの形を出さない', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    expect(screen.getByRole('group', { name: 'モジュールの形' })).toBeDefined()
    await userEvent.click(screen.getByRole('radio', { name: 'Code 128' }))
    expect(screen.queryByRole('group', { name: 'モジュールの形' })).toBeNull()
  })

  test('QR 以外では誤り訂正レベルを出さない', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    expect(screen.getByRole('group', { name: '誤り訂正レベル' })).toBeDefined()
    await userEvent.click(screen.getByRole('radio', { name: 'EAN-13 / JAN' }))
    expect(screen.queryByRole('group', { name: '誤り訂正レベル' })).toBeNull()
  })

  test('内容とコードの種類が合わないときは、その場で警告する', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'EAN-13 / JAN' }))
    expect(screen.getByRole('alert').textContent).toContain('表せません')
  })
})

describe('GenerateScreen（ライブモード）', () => {
  test('設定を触ると、ボタンなしで生成される', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: '生成する' })).toBeNull()
  })

  /** ライブ更新で毎回読み上げると、しゃべり続けて使い物にならない。 */
  test('成功しても読み上げ領域を汚さない', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    await waitFor(() => expect(screen.getByText('URL: https://qrcc.riml4i.com')).toBeDefined())
    // プレビュー側にも保存操作用の領域があるので、どれも汚れていないことを見る
    for (const region of screen.getAllByRole('status')) {
      expect(region.textContent).toBe('')
    }
  })

  test('問題があるときだけ読み上げる', async () => {
    const { fn } = recording({
      ok: true,
      value: response({ warnings: [{ kind: 'low_contrast', ratio: 1.26, minimum: 3 }] }),
    })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((region) => region.textContent?.includes('コントラスト')),
      ).toBe(true),
    )
  })

  test('連続した入力では最後の 1 回だけ生成する', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={50} />)
    const scale = screen.getByLabelText('1 モジュールの大きさ')
    await userEvent.clear(scale)
    await userEvent.type(scale, '12')
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    // 初回 + 入力が落ち着いてからの 1 回。文字数ぶん走らない
    expect(requests.length).toBeLessThanOrEqual(3)
  })
})
