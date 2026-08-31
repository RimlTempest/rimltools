import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { VisuallyHidden } from './visually-hidden.tsx'

afterEach(cleanup)

describe('VisuallyHidden', () => {
  test('支援技術からは読めるまま残る（aria-hidden にしない）', () => {
    render(<VisuallyHidden>読み込み中</VisuallyHidden>)
    const node = screen.getByText('読み込み中')
    expect(node.getAttribute('aria-hidden')).toBeNull()
  })

  test('既定は span で、要素は差し替えられる', () => {
    render(<VisuallyHidden>あ</VisuallyHidden>)
    expect(screen.getByText('あ').tagName).toBe('SPAN')
    cleanup()
    render(<VisuallyHidden as="h2">見出し</VisuallyHidden>)
    expect(screen.getByText('見出し').tagName).toBe('H2')
  })
})
