import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
