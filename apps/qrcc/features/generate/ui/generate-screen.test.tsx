import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  parseEmailAddress,
  parseHttpUrl,
  parseNonEmptyText,
  parsePhoneNumber,
} from '@qrcc/contract'
import { parseCalendarTimestamp } from '../core/payload/event.ts'
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
    await userEvent.type(screen.getByLabelText('電話番号（国番号付き）'), '090-1234-5678')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('電話番号'))
    expect(requests).toHaveLength(0)
  })

  test('メールを選ぶと入力欄が宛先・件名・本文になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'メール' }))
    expect(screen.getByLabelText('宛先メールアドレス')).toBeDefined()
    expect(screen.getByLabelText('件名')).toBeDefined()
    expect(screen.getByLabelText('本文')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('宛先メールアドレス'), 'someone@example.com')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const to = parseEmailAddress('someone@example.com')
    expect(to.ok).toBe(true)
    if (to.ok) {
      expect(requests[0]?.payload).toEqual({ kind: 'email', to: to.value, subject: '', body: '' })
    }
  })

  test('宛先メールアドレスが不正なときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'メール' }))
    await userEvent.type(screen.getByLabelText('宛先メールアドレス'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('メールアドレス'))
    expect(requests).toHaveLength(0)
  })

  test('SMS を選ぶと入力欄が電話番号・本文になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'SMS' }))
    expect(screen.getByLabelText('送信先の電話番号（国番号付き）')).toBeDefined()
    expect(screen.getByLabelText('本文')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('送信先の電話番号（国番号付き）'), '+819012345678')
    await userEvent.type(screen.getByLabelText('本文'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const number = parsePhoneNumber('+819012345678')
    expect(number.ok).toBe(true)
    if (number.ok) {
      expect(requests[0]?.payload).toEqual({
        kind: 'sms',
        number: number.value,
        body: 'こんにちは',
      })
    }
  })

  test('SMS の電話番号が不正なときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: 'SMS' }))
    await userEvent.type(screen.getByLabelText('送信先の電話番号（国番号付き）'), '090-1234-5678')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('電話番号'))
    expect(requests).toHaveLength(0)
  })

  test('位置情報を選ぶと入力欄が緯度・経度になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '位置情報' }))
    expect(screen.getByLabelText('緯度')).toBeDefined()
    expect(screen.getByLabelText('経度')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('緯度'), '35.681236')
    await userEvent.type(screen.getByLabelText('経度'), '139.767125')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const payload = requests[0]?.payload
    expect(payload?.kind).toBe('geo')
    if (payload?.kind === 'geo') {
      expect(payload.lat).toBeCloseTo(35.681236)
      expect(payload.lon).toBeCloseTo(139.767125)
    }
  })

  test('緯度が範囲外なときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '位置情報' }))
    await userEvent.type(screen.getByLabelText('緯度'), '200')
    await userEvent.type(screen.getByLabelText('経度'), '0')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('緯度'))
    expect(requests).toHaveLength(0)
  })

  test('予定を選ぶと入力欄が件名・開始・終了・場所になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '予定' }))
    expect(screen.getByLabelText('件名')).toBeDefined()
    expect(screen.getByLabelText('開始日時')).toBeDefined()
    expect(screen.getByLabelText('終了日時')).toBeDefined()
    expect(screen.getByLabelText('場所')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('件名'), '定例会議')
    await userEvent.type(screen.getByLabelText('開始日時'), '2026-09-06T10:00')
    await userEvent.type(screen.getByLabelText('終了日時'), '2026-09-06T11:00')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const payload = requests[0]?.payload
    expect(payload?.kind).toBe('event')
    const subject = parseNonEmptyText('定例会議')
    const start = parseCalendarTimestamp('2026-09-06T10:00')
    const end = parseCalendarTimestamp('2026-09-06T11:00')
    expect(subject.ok).toBe(true)
    expect(start.ok).toBe(true)
    expect(end.ok).toBe(true)
    if (payload?.kind === 'event' && subject.ok && start.ok && end.ok) {
      expect(payload.event).toEqual({
        subject: subject.value,
        start: start.value,
        end: end.value,
        location: '',
      })
    }
  })

  test('終了日時が開始日時より前のときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '予定' }))
    await userEvent.type(screen.getByLabelText('件名'), '定例会議')
    await userEvent.type(screen.getByLabelText('開始日時'), '2026-09-06T11:00')
    await userEvent.type(screen.getByLabelText('終了日時'), '2026-09-06T10:00')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('終了日時'))
    expect(requests).toHaveLength(0)
  })

  test('名刺を選ぶと入力欄が氏名・組織・電話・メール・URL になる', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '名刺' }))
    expect(screen.getByLabelText('氏名')).toBeDefined()
    expect(screen.getByLabelText('組織')).toBeDefined()
    expect(screen.getByLabelText('名刺の電話番号（国番号付き）')).toBeDefined()
    expect(screen.getByLabelText('名刺のメールアドレス')).toBeDefined()
    expect(screen.getByLabelText('名刺の URL')).toBeDefined()
    expect(screen.queryByLabelText('リンク先の URL')).toBeNull()

    await userEvent.type(screen.getByLabelText('氏名'), '山田太郎')
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const name = parseNonEmptyText('山田太郎')
    expect(name.ok).toBe(true)
    if (name.ok) {
      expect(requests[0]?.payload).toEqual({
        kind: 'vcard',
        card: {
          name: name.value,
          organization: '',
          tel: undefined,
          email: undefined,
          url: undefined,
        },
      })
    }
  })

  test('氏名が空なときはその場で理由を伝える', async () => {
    const { fn, requests } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} />)
    await userEvent.click(screen.getByRole('radio', { name: '名刺' }))
    await userEvent.click(screen.getByRole('button', { name: '生成する' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('氏名'))
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

/**
 * 区画が窓（Mado）として出ているか。
 *
 * 窓は「帯（header）＋ 本体」の 2 段で、見出しは帯の中に入る（riml-ds ADR-0014）。
 * 題のない figure の板では region 自体が無いので通らない。
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

describe('GenerateScreen の区画', () => {
  test('生成したコードは窓として出て、プレビューはその中に入る', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} />)
    await screen.findByRole('figure')
    expectWindow('生成したコード')
    // 窓は画面の区画の単位。プレビューは窓の中身であって、それ自体は窓にしない
    const region = screen.getByRole('region', { name: '生成したコード' })
    expect(within(region).getByRole('figure')).toBeDefined()
  })

  test('埋め込むと窓の帯は 1 段下がる（AAA 2.4.10）', async () => {
    const { fn } = recording({ ok: true, value: response() })
    render(<GenerateScreen render={fn} mode="live" debounceMs={0} headingLevel={2} />)
    expect(await screen.findByRole('heading', { level: 3, name: '生成したコード' })).toBeDefined()
  })
})
