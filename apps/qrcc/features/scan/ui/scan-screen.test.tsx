import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Detection, ScanFailure } from '../contract/index.ts'
import type { ScanSession, StartCamera } from './scan-screen.tsx'
import { ScanScreen } from './scan-screen.tsx'

afterEach(cleanup)

const found = (text: string, symbology: Detection['symbology'] = 'qr'): Detection => ({
  text,
  symbology,
  corners: [],
})

/** カメラの偽物。テストから検出や失敗を好きな時点で起こせる。 */
const fakeCamera = () => {
  let onDetect: ((detection: Detection) => void) | undefined
  let onFail: ((failure: ScanFailure) => void) | undefined
  const videos: (HTMLVideoElement | null)[] = []
  const state = { stops: 0, starts: 0, videos }

  const startCamera: StartCamera = async (options) => {
    state.starts += 1
    state.videos.push(options.video)
    onDetect = options.onDetect
    onFail = options.onFail
    const session: ScanSession = {
      stop: () => {
        state.stops += 1
      },
    }
    return { ok: true, value: session }
  }

  return {
    startCamera,
    state,
    detect: async (detection: Detection) => {
      await act(async () => onDetect?.(detection))
    },
    fail: async (failure: ScanFailure) => {
      await act(async () => onFail?.(failure))
    },
  }
}

const neverDecodes = async () => ({ ok: false, error: { kind: 'not_found' } }) as const

const decodesTo =
  (...detections: readonly Detection[]) =>
  async () =>
    ({ ok: true, value: { detections } }) as const

/** 権限を拒否するカメラ。 */
const refusedCamera: StartCamera = async () => ({ ok: false, error: { kind: 'permission_denied' } })

const pngFile = () =>
  new File([new Uint8Array([137, 80, 78, 71])], 'code.png', { type: 'image/png' })

describe('ScanScreen', () => {
  /**
   * トップページは生成と読み取りを 1 ページに並べる。h1 はページの主題に
   * 使うので、埋め込まれた側は 1 段下げる（AAA 2.4.10）。
   */
  test('埋め込むと h2 で始まり、下位の見出しも 1 段下がる', () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
        headingLevel={2}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'コードを読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'カメラで読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: '画像から読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: '読み取った内容' })).toBeDefined()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  test('2 つの読み取り手段が見出しで取れる', () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'コードを読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'カメラで読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { name: '画像から読み取る' })).toBeDefined()
  })

  /** カメラが無い環境でも、画像読み取りだけで完結すること。 */
  test('カメラを使えない環境では代替手段だけを案内する', () => {
    render(
      <ScanScreen startCamera={undefined} decodeImageFile={neverDecodes} copyText={undefined} />,
    )
    expect(screen.queryByRole('button', { name: 'カメラを起動する' })).toBeNull()
    expect(screen.getByLabelText('コードが写っている画像')).toBeDefined()
    expect(screen.getByText(/このブラウザではカメラを使えません/)).toBeDefined()
  })

  test('画像はサーバに送らないと画面に書いてある', () => {
    render(
      <ScanScreen startCamera={undefined} decodeImageFile={neverDecodes} copyText={undefined} />,
    )
    // 冒頭の説明と、ファイル選択の補足の両方に書いてある
    expect(screen.getAllByText(/サーバ(に|へ)は?送信/).length).toBeGreaterThan(0)
  })

  test('カメラを起動すると読み上げ領域に伝わる', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('読み取っています'),
    )
    expect(camera.state.starts).toBe(1)
  })

  test('起動したカメラには映像の置き場を渡す', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() => expect(camera.state.videos[0]).not.toBeNull())
  })

  test('カメラを止めると読み上げ、映像も止める', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() => screen.getByRole('button', { name: 'カメラを停止する' }))
    await userEvent.click(screen.getByRole('button', { name: 'カメラを停止する' }))
    expect(camera.state.stops).toBe(1)
    expect(screen.getByRole('status').textContent).toContain('停止')
  })

  test('権限を拒否されたら理由と代替手段を読み上げる', async () => {
    render(
      <ScanScreen
        startCamera={refusedCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('画像から読み取る'),
    )
    // 押し直せる状態に戻っていること
    expect(screen.getByRole('button', { name: 'カメラを起動する' })).toBeDefined()
  })

  test('検出した内容が一覧に出て読み上げられる', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() => screen.getByRole('button', { name: 'カメラを停止する' }))

    await camera.detect(found('在庫-0001', 'code128'))
    expect(screen.getByText('在庫-0001')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('在庫-0001')
    expect(screen.getByText('種類: Code 128')).toBeDefined()
  })

  test('同じ値を続けて検出しても一覧は増えない', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() => screen.getByRole('button', { name: 'カメラを停止する' }))

    await camera.detect(found('SAME'))
    await camera.detect(found('SAME'))
    await camera.detect(found('SAME'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  test('カメラが途中で使えなくなったら理由を読み上げて止まる', async () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'カメラを起動する' }))
    await waitFor(() => screen.getByRole('button', { name: 'カメラを停止する' }))

    await camera.fail({ kind: 'camera_unavailable', detail: 'track ended' })
    expect(screen.getByRole('status').textContent).toContain('カメラを起動できませんでした')
    expect(screen.getByRole('button', { name: 'カメラを起動する' })).toBeDefined()
  })

  test('URL はリンクになる', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('https://qrcc.riml4i.com/a'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'https://qrcc.riml4i.com/a' }).getAttribute('href'),
      ).toBe('https://qrcc.riml4i.com/a'),
    )
  })

  /**
   * 項目が 1 つも無い連絡先で、中身の無い説明リスト（<dl>）を出さない。
   * 空の <dl> は支援技術に「リスト、0 項目」とだけ伝わり、何の情報も無い。
   */
  test('項目が空の連絡先では、空の説明リストを出さない', async () => {
    const { container } = render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('MECARD:;;'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('MECARD:;;')).toBeDefined())
    for (const list of container.querySelectorAll('dl')) {
      expect(list.querySelectorAll('dt').length).toBeGreaterThan(0)
    }
  })

  test('項目のある連絡先は、ある項目だけを説明リストに出す', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('MECARD:N:山田 太郎;TEL:0312345678;;'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('山田 太郎')).toBeDefined())
    expect(screen.getByText('氏名')).toBeDefined()
    expect(screen.getByText('電話')).toBeDefined()
    expect(screen.queryByText('メール')).toBeNull()
    expect(screen.queryByText('組織')).toBeNull()
  })

  /** javascript: を踏ませない。リンクにするのは http(s) だけ。 */
  test('http(s) でない内容はリンクにしない', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('javascript:alert(1)'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('javascript:alert(1)')).toBeDefined())
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
  })

  /** tel: は解釈しても、既存のセキュリティ判断（http(s) だけリンクにする）を緩めない。 */
  test('tel: を解釈しても、電話番号はリンクにしない', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('tel:+819012345678'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('tel:+819012345678')).toBeDefined())
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('+819012345678')).toBeDefined()
  })

  test('GS1 の要素文字列を解釈して GTIN などを出す。生のテキストも残す', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('0104912345678904172512311012345', 'rss14'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    // 生のテキスト
    await waitFor(() => expect(screen.getByText('0104912345678904172512311012345')).toBeDefined())
    // 解釈した内容
    expect(screen.getByText('04912345678904')).toBeDefined()
    expect(screen.getByText('12345')).toBeDefined()
  })

  test('解釈できない内容は、いまと同じく素のテキストとして出る', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('在庫-0001', 'code128'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('在庫-0001')).toBeDefined())
  })

  test('Wi-Fi のパスワードは既定で伏せられ、押すと見える', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('WIFI:S:MyNet;T:WPA;P:secret;;'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    // 生のテキストは残る
    await waitFor(() => expect(screen.getByText('WIFI:S:MyNet;T:WPA;P:secret;;')).toBeDefined())
    // SSID は見えるが、パスワードは既定では見えない
    expect(screen.getByText('MyNet')).toBeDefined()
    expect(screen.queryByText('secret')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'パスワードを表示する' }))
    expect(screen.getByText('secret')).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'パスワードを隠す' }))
    expect(screen.queryByText('secret')).toBeNull()
  })

  test('画像を選ぶと読み取り、結果を出す', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('FROM-FILE'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => expect(screen.getByText('FROM-FILE')).toBeDefined())
    expect(screen.getByRole('status').textContent).toContain('FROM-FILE')
  })

  test('画像から読めなければ、次にどうすればよいかを読み上げる', async () => {
    render(
      <ScanScreen startCamera={undefined} decodeImageFile={neverDecodes} copyText={undefined} />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('見つかりませんでした'),
    )
  })

  test('読み取った内容をコピーできる', async () => {
    const copied: string[] = []
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('COPY-ME'))}
        copyText={async (text) => {
          copied.push(text)
          return true
        }}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => screen.getByRole('button', { name: /COPY-ME/ }))
    await userEvent.click(screen.getByRole('button', { name: /COPY-ME/ }))
    await waitFor(() => expect(copied).toEqual(['COPY-ME']))
    expect(screen.getByRole('status').textContent).toContain('コピーしました')
  })

  test('コピーできない環境ではコピー操作を出さない', async () => {
    render(
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodesTo(found('NO-CLIPBOARD'))}
        copyText={undefined}
      />,
    )
    await userEvent.upload(screen.getByLabelText('コードが写っている画像'), pngFile())
    await waitFor(() => screen.getByText('NO-CLIPBOARD'))
    expect(screen.queryByRole('button', { name: /コピー/ })).toBeNull()
  })

  test('まだ何も読み取っていないことを伝える', () => {
    render(
      <ScanScreen startCamera={undefined} decodeImageFile={neverDecodes} copyText={undefined} />,
    )
    expect(screen.getByText(/まだ読み取っていません/)).toBeDefined()
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

describe('ScanScreen の区画', () => {
  test('題のある区画は窓として出る', () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
      />,
    )
    expectWindow('カメラで読み取る')
    expectWindow('画像から読み取る')
    expectWindow('読み取った内容')
  })

  test('埋め込むと窓の帯は 1 段下がる（AAA 2.4.10）', () => {
    const camera = fakeCamera()
    render(
      <ScanScreen
        startCamera={camera.startCamera}
        decodeImageFile={neverDecodes}
        copyText={undefined}
        headingLevel={2}
      />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'カメラで読み取る' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: '読み取った内容' })).toBeDefined()
  })
})

/**
 * 遅い端末では、サーバが描いた HTML が見えてから React がつながるまでに間がある。
 * その間に選んだ画像は change イベントが React に届かず、何も起きなかった
 * （並列の e2e で読み取りが不定期に失敗した原因）。つながった時点で拾うこと。
 */
describe('ハイドレーション前に選ばれた画像', () => {
  test('React がつながった時点で読み取る', async () => {
    const { renderToString } = await import('react-dom/server')
    const { hydrateRoot } = await import('react-dom/client')
    const decoded: File[] = []
    const decodeImageFile = async (file: File) => {
      decoded.push(file)
      return { ok: true, value: { detections: [found('https://example.com/early')] } } as const
    }
    const element = (
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodeImageFile}
        copyText={async () => true}
      />
    )

    const container = document.createElement('div')
    container.innerHTML = renderToString(element)
    document.body.append(container)

    // React がつながる前に、利用者が画像を選んだ状態
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    const file = pngFile()
    if (input !== null) Object.defineProperty(input, 'files', { value: [file] })

    await act(async () => {
      hydrateRoot(container, element)
    })

    await waitFor(() => expect(decoded).toEqual([file]))
    expect(await within(container).findByText('https://example.com/early')).toBeDefined()
    container.remove()
  })

  test('何も選ばれていなければ読み取らない', async () => {
    const { renderToString } = await import('react-dom/server')
    const { hydrateRoot } = await import('react-dom/client')
    const decoded: File[] = []
    const decodeImageFile = async (file: File) => {
      decoded.push(file)
      return neverDecodes()
    }
    const element = (
      <ScanScreen
        startCamera={undefined}
        decodeImageFile={decodeImageFile}
        copyText={async () => true}
      />
    )

    const container = document.createElement('div')
    container.innerHTML = renderToString(element)
    document.body.append(container)

    await act(async () => {
      hydrateRoot(container, element)
    })

    expect(decoded).toEqual([])
    container.remove()
  })
})
