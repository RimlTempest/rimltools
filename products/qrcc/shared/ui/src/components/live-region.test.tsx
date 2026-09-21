import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { LiveRegion } from './live-region.tsx'

afterEach(cleanup)

describe('LiveRegion', () => {
  test('メッセージがなくても DOM に存在する（後から挿入すると読み上げられない）', () => {
    const { container } = render(<LiveRegion message={undefined} />)
    expect(container.querySelector('[aria-live]')).not.toBeNull()
  })

  test('既定は polite の status', () => {
    render(<LiveRegion message="保存しました" />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toBe('保存しました')
  })

  test('urgency=assertive では alert になる', () => {
    render(<LiveRegion message="入力に誤りがあります" urgency="assertive" />)
    const region = screen.getByRole('alert')
    expect(region.getAttribute('aria-live')).toBe('assertive')
  })

  test('更新のたびに全文を読み上げる（部分更新にしない）', () => {
    const { container } = render(<LiveRegion message="1件" />)
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-atomic')).toBe('true')
  })
})
