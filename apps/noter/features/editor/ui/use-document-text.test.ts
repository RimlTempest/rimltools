import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import * as Y from 'yjs'
import { useDocumentText } from './use-document-text.ts'

afterEach(cleanup)

const textOf = (initial: string): Y.Text => {
  const ytext = new Y.Doc().getText('content')
  if (initial !== '') ytext.insert(0, initial)
  return ytext
}

describe('useDocumentText', () => {
  test('いまの本文をそのまま返す', () => {
    const { result } = renderHook(() => useDocumentText(textOf('# 設計'), 1))
    expect(result.current).toBe('# 設計')
  })

  test('本文が変わると、少し待ってから新しい本文になる', async () => {
    const ytext = textOf('a')
    const { result } = renderHook(() => useDocumentText(ytext, 1))

    act(() => {
      ytext.insert(1, 'b')
    })
    await waitFor(() => {
      expect(result.current).toBe('ab')
    })
  })

  test('続けて変わっても、最後の本文に落ち着く', async () => {
    const ytext = textOf('')
    const { result } = renderHook(() => useDocumentText(ytext, 1))

    act(() => {
      ytext.insert(0, 'a')
      ytext.insert(1, 'b')
      ytext.insert(2, 'c')
    })
    await waitFor(() => {
      expect(result.current).toBe('abc')
    })
  })

  test('画面から外れたあとの変更は読まない', async () => {
    const ytext = textOf('a')
    const { result, unmount } = renderHook(() => useDocumentText(ytext, 1))
    unmount()

    ytext.insert(1, 'b')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(result.current).toBe('a')
  })
})
