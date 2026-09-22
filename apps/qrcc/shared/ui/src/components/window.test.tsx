import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Window } from './window.tsx'

afterEach(cleanup)

describe('Window', () => {
  test('題をアクセシブル名に持つ region として描画される', () => {
    render(<Window title="読み取り結果">中身</Window>)
    const region = screen.getByRole('region', { name: '読み取り結果' })
    expect(region.className).toBe('rd-window')
    expect(screen.getByRole('heading', { level: 2, name: '読み取り結果' }).className).toBe(
      'rd-window-title',
    )
    expect(region.querySelector('.rd-window-body')?.textContent).toBe('中身')
  })

  test('帯は header で、見出しはその中にある', () => {
    render(<Window title="題">x</Window>)
    const region = screen.getByRole('region', { name: '題' })
    expect(region.querySelector('header.rd-window-bar > h2.rd-window-title')).not.toBeNull()
  })

  test('見出しの段は変えられる', () => {
    render(
      <Window title="詳細" headingLevel={3}>
        x
      </Window>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '詳細' })).toBeDefined()
  })

  test('トーンは帯（header）の data-tone で渡し、既定では付かない', () => {
    render(
      <Window title="注意" tone="warning">
        x
      </Window>,
    )
    const bar = screen.getByRole('region', { name: '注意' }).querySelector('header.rd-window-bar')
    expect(bar?.getAttribute('data-tone')).toBe('warning')
    expect(screen.getByRole('heading', { name: '注意' }).getAttribute('data-tone')).toBeNull()
    cleanup()
    render(<Window title="ふつう">x</Window>)
    expect(
      screen
        .getByRole('region', { name: 'ふつう' })
        .querySelector('header.rd-window-bar')
        ?.getAttribute('data-tone'),
    ).toBeNull()
  })

  test('id を渡すとその id が section に付き、aria-labelledby は見出しを指す', () => {
    render(
      <Window title="題" id="result">
        x
      </Window>,
    )
    const region = screen.getByRole('region', { name: '題' })
    expect(region.id).toBe('result')
    const labelledBy = region.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelledBy)?.textContent).toBe('題')
  })

  test('操作が 1 つも無ければ丸を描かない', () => {
    render(<Window title="題">x</Window>)
    expect(
      screen.getByRole('region', { name: '題' }).querySelector('.rd-window-controls'),
    ).toBeNull()
  })

  test('onClose を渡すと閉じる丸が出て、押すと呼ばれる', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const onClose = mock(() => {})
    render(
      <Window title="削除しました" onClose={onClose}>
        x
      </Window>,
    )
    const close = screen.getByRole('button', { name: '閉じる' })
    expect(close.dataset['action']).toBe('close')
    expect(close.className).toBe('rd-window-control')
    await userEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('collapsible なら たたむ丸が出て、押すと本文が隠れる', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(
      <Window title="フォルダ" collapsible>
        中身
      </Window>,
    )
    const region = screen.getByRole('region', { name: 'フォルダ' })
    const body = region.querySelector('.rd-window-body')
    const collapse = screen.getByRole('button', { name: 'たたむ' })
    expect(collapse.dataset['action']).toBe('collapse')
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(collapse.getAttribute('aria-controls')).toBe(body?.id ?? null)
    expect(body?.hasAttribute('hidden')).toBe(false)

    await userEvent.click(collapse)
    expect(collapse.getAttribute('aria-expanded')).toBe('false')
    expect(body?.hasAttribute('hidden')).toBe(true)
    // たたんでもラベルは変えない。状態は aria-expanded が伝える
    expect(screen.getByRole('button', { name: 'たたむ' })).toBe(collapse)

    await userEvent.click(collapse)
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(body?.hasAttribute('hidden')).toBe(false)
  })
})
