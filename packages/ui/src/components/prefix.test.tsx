import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { createUiComponents } from '../index.ts'

afterEach(cleanup)

// クラス名の接頭辞はプロダクトの CSS と対応する。共通化で DOM が変わらないことを確かめる。
describe('createUiComponents', () => {
  test('クラス名にプロダクトの接頭辞を使う', () => {
    const { Button, Field, LiveRegion, SkipLink, VisuallyHidden } = createUiComponents('qrcc')
    render(
      <>
        <SkipLink targetId="main" />
        <Button>保存</Button>
        <Field label="名前" hint="補足" error="必須" />
        <LiveRegion message="完了" />
        <VisuallyHidden>隠す</VisuallyHidden>
      </>,
    )
    expect(screen.getByRole('link').className).toBe('qrcc-skip-link')
    expect(screen.getByRole('button').className).toBe('qrcc-button')
    const input = screen.getByRole('textbox', { name: '名前' })
    expect(input.className).toBe('qrcc-field__control')
    expect(input.closest('div')?.className).toBe('qrcc-field')
    expect(screen.getByText('補足').className).toBe('qrcc-field__hint')
    expect(screen.getByText('必須').className).toBe('qrcc-field__error')
    expect(screen.getByRole('status').className).toBe('qrcc-live-region')
    expect(screen.getByText('隠す').className).toBe('qrcc-visually-hidden')
  })

  test('ThemeToggle も接頭辞付きの fieldset を描く', () => {
    const { ThemeToggle } = createUiComponents('noter')
    render(<ThemeToggle store={{ read: () => 'system', write: () => undefined }} />)
    expect(screen.getByRole('group', { name: 'テーマ' }).className).toBe('noter-theme-toggle')
  })
})
