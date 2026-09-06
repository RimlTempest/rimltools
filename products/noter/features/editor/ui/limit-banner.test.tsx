import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LimitBanner, limitReasonOf } from './limit-banner.tsx'

afterEach(cleanup)

beforeEach(() => {
  try {
    globalThis.sessionStorage.clear()
  } catch {
    // 使えない環境でも、このテストの前提は「覚えていない」だけ
  }
})

const DOCUMENT_ID = 'doc_000000000000000000000001'

const show = (reason: 'limit' | 'too_large' = 'limit') => {
  render(<LimitBanner reason={reason} documentId={DOCUMENT_ID} exportTargetId="noter-export" />)
}

describe('limitReasonOf', () => {
  test('上限と大きすぎるときだけバナーを出す', () => {
    expect(limitReasonOf({ kind: 'rejected', reason: 'limit' })).toBe('limit')
    expect(limitReasonOf({ kind: 'rejected', reason: 'too_large' })).toBe('too_large')
  })

  test('ほかの拒否理由と通常の接続では出さない', () => {
    expect(limitReasonOf({ kind: 'rejected', reason: 'forbidden' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'rejected', reason: 'not_found' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'rejected', reason: 'bad_request' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'connected' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'offline' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'connecting' })).toBeUndefined()
    expect(limitReasonOf({ kind: 'reconnecting', attempt: 2 })).toBeUndefined()
  })
})

describe('LimitBanner', () => {
  test('上限のときは編集を続けられることと書き出しを伝える', () => {
    show('limit')
    const banner = screen.getByRole('region', { name: '本日の同期上限に達しました' })
    expect(banner.textContent).toContain('編集は続けられます')
    expect(banner.textContent).toContain('書き出し')
  })

  test('大きすぎるときは分割を促す', () => {
    show('too_large')
    const banner = screen.getByRole('region', { name: '文書が上限を超えました' })
    expect(banner.textContent).toContain('分けて')
  })

  /**
   * 画面の読み上げ領域は `EditorScreen` の `LiveRegion` ただ 1 つ
   * （docs/accessibility.md §2 の 4.1.3）。バナーは同じ内容を二重に読ませない。
   */
  test('読み上げ領域にしない', () => {
    show()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('書き出しの操作へ移動できる', () => {
    show()
    const link = screen.getByRole('link', { name: '書き出しの操作へ移動' })
    expect(link.getAttribute('href')).toBe('#noter-export')
  })

  test('閉じると消える', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('region', { name: /上限/ })).toBeNull()
  })

  test('同じ文書では閉じたままにする', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    cleanup()

    show()
    expect(screen.queryByRole('region', { name: /上限/ })).toBeNull()
  })

  test('別の文書ではもう一度出す', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    cleanup()

    render(
      <LimitBanner
        reason="limit"
        documentId="doc_000000000000000000000002"
        exportTargetId="noter-export"
      />,
    )
    expect(screen.getByRole('region', { name: '本日の同期上限に達しました' })).toBeDefined()
  })

  test('sessionStorage が使えなくても描画する', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('sessionStorage is blocked')
      },
    })
    try {
      const user = userEvent.setup()
      show()
      expect(screen.getByRole('region', { name: '本日の同期上限に達しました' })).toBeDefined()
      // 覚えられないだけで、その場で閉じることはできる
      await user.click(screen.getByRole('button', { name: '閉じる' }))
      expect(screen.queryByRole('region', { name: /上限/ })).toBeNull()
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage')
      else Object.defineProperty(globalThis, 'sessionStorage', original)
    }
  })
})
