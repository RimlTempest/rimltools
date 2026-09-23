import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RenderResponse } from '../contract/index.ts'
import type { CanvasDeps } from './download.ts'
import { DownloadControls } from './download-controls.tsx'

afterEach(cleanup)

const response: RenderResponse = {
  body: '<svg/>',
  content_type: 'image/svg+xml',
  width: 40,
  height: 40,
  description: 'URL: https://example.com',
  warnings: [],
}

const workingDeps = (): CanvasDeps => ({
  rasterizeUrl: async () => ({ ok: true, value: new Blob(['png'], { type: 'image/png' }) }),
  rasterizeElement: async () => ({ ok: true, value: new Blob(['png'], { type: 'image/png' }) }),
  createObjectUrl: () => 'blob:x',
  revokeObjectUrl: () => {},
})

const recordingSave = () => {
  const saved: { name: string; type: string }[] = []
  return { saved, save: (blob: Blob, name: string) => saved.push({ name, type: blob.type }) }
}

describe('DownloadControls', () => {
  test('SVG と PNG の保存を出す', () => {
    const { save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    expect(screen.getByRole('button', { name: 'SVG で保存' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'PNG で保存' })).toBeDefined()
  })

  test('SVG を内容から名前を付けて保存する', async () => {
    const { saved, save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'SVG で保存' }))
    expect(saved[0]?.name).toBe('URL-httpsexample.com.svg')
    expect(saved[0]?.type).toBe('image/svg+xml;charset=utf-8')
  })

  test('PNG に変換して保存する', async () => {
    const { saved, save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'PNG で保存' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]?.type).toBe('image/png')
  })

  test('保存したことを読み上げ領域で伝える', async () => {
    const { save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'SVG で保存' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('保存しました'))
  })

  /** HTML in Canvas はまだフラグ付きなので、使えない環境では出さない。 */
  test('drawElementImage が使えなければ「説明つき」を出さない', () => {
    const { save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    expect(screen.queryByRole('button', { name: '説明つき PNG で保存' })).toBeNull()
  })

  test('使える環境では「説明つき」を出す', () => {
    const { save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={workingDeps()}
        save={save}
        canCaptureElement={() => true}
      />,
    )
    expect(screen.getByRole('button', { name: '説明つき PNG で保存' })).toBeDefined()
  })

  test('変換に失敗したら、次にどうすればよいかを伝える', async () => {
    const failing: CanvasDeps = {
      ...workingDeps(),
      rasterizeUrl: async () => ({
        ok: false,
        error: { kind: 'unsupported', detail: '2d canvas context is unavailable' },
      }),
    }
    const { save } = recordingSave()
    render(
      <DownloadControls
        response={response}
        deps={failing}
        save={save}
        canCaptureElement={() => false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'PNG で保存' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('SVG'))
  })
})
