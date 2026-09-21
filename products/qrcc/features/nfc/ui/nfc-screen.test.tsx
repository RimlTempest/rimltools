import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Result } from '@qrcc/contract'
import type { NfcWriteError } from '../contract/index.ts'
import type { WriteNfc } from './browser-nfc.ts'
import { NfcScreen } from './nfc-screen.tsx'

afterEach(cleanup)

/** 呼ばれた回数を数えられる偽の書き込み。 */
const countingWriter = (outcome: Result<void, NfcWriteError>) => {
  const state = { calls: 0 }
  const write: WriteNfc = async () => {
    state.calls += 1
    return outcome
  }
  return { write, state }
}

describe('NfcScreen（非対応の環境）', () => {
  test('使えない理由が、ボタンより先に出る', () => {
    render(<NfcScreen writeNfc={undefined} />)
    expect(screen.getByText(/対応していません/)).toBeDefined()
    expect(screen.getByText(/Android/)).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('NfcScreen（対応している環境）', () => {
  test('確認せずには書き込まない（write は入力段階では呼ばれない）', async () => {
    const { write, state } = countingWriter({ ok: true, value: undefined })
    render(<NfcScreen writeNfc={write} />)

    await userEvent.type(screen.getByLabelText('書き込む内容'), 'https://qrcc.riml4i.com')
    await userEvent.click(screen.getByRole('button', { name: '内容を確認する' }))

    expect(state.calls).toBe(0)
    // 確認画面には内容と、元に戻せないことの案内が出る
    expect(screen.getByText(/https:\/\/qrcc\.riml4i\.com/)).toBeDefined()
    expect(screen.getByText(/元に戻せません/)).toBeDefined()
  })

  test('確認後に書き込むボタンを押すと初めて write が呼ばれ、進行が読み上げ領域に出る', async () => {
    let resolveWrite: ((outcome: Result<void, NfcWriteError>) => void) | undefined
    const write: WriteNfc = () =>
      new Promise((resolve) => {
        resolveWrite = resolve
      })

    render(<NfcScreen writeNfc={write} />)
    await userEvent.type(screen.getByLabelText('書き込む内容'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: '内容を確認する' }))
    await userEvent.click(screen.getByRole('button', { name: '書き込む' }))

    expect(screen.getByRole('status').textContent).toContain('タグを近づけてください')

    resolveWrite?.({ ok: true, value: undefined })
    await screen.findAllByText(/書き込みました/)
  })

  test('入力が空のまま確認しようとすると、書き込まずに案内する', async () => {
    const { write, state } = countingWriter({ ok: true, value: undefined })
    render(<NfcScreen writeNfc={write} />)

    await userEvent.click(screen.getByRole('button', { name: '内容を確認する' }))

    expect(state.calls).toBe(0)
    expect(screen.getByText(/入力してください/)).toBeDefined()
  })

  test('書き込みに失敗しても、入力し直さずやり直せる', async () => {
    const { write } = countingWriter({ ok: false, error: { kind: 'no_tag' } })
    render(<NfcScreen writeNfc={write} />)

    await userEvent.type(screen.getByLabelText('書き込む内容'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: '内容を確認する' }))
    await userEvent.click(screen.getByRole('button', { name: '書き込む' }))

    await screen.findByText(/タグが見つかりませんでした/)
    // 内容は保持され、もう一度「書き込む」を押せる
    expect(screen.getByRole('button', { name: '書き込む' })).toBeDefined()
    expect(screen.getByText(/こんにちは/)).toBeDefined()
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

describe('NfcScreen の区画', () => {
  test('確認の区画は窓として出る', async () => {
    const { write } = countingWriter({ ok: true, value: undefined })
    render(<NfcScreen writeNfc={write} />)

    await userEvent.type(screen.getByLabelText('書き込む内容'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: '内容を確認する' }))

    expectWindow('書き込む内容を確認してください')
  })
})
