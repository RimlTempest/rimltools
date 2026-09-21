import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button.tsx'

afterEach(cleanup)

describe('Button', () => {
  test('ネイティブの button 要素として、可視テキストがそのままアクセシブル名になる', () => {
    render(<Button>保存</Button>)
    const button = screen.getByRole('button', { name: '保存' })
    expect(button.tagName).toBe('BUTTON')
  })

  test('既定の type は button（フォーム内で意図せず送信しない）', () => {
    render(<Button>保存</Button>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })

  test('クリックできる', async () => {
    let clicked = 0
    render(
      <Button
        onClick={() => {
          clicked += 1
        }}
      >
        保存
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(clicked).toBe(1)
  })

  test('キーボードの Enter でも押せる', async () => {
    let clicked = 0
    render(
      <Button
        onClick={() => {
          clicked += 1
        }}
      >
        保存
      </Button>,
    )
    screen.getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(clicked).toBe(1)
  })

  test('busy のときは aria-busy を立て、disabled にせずフォーカスを保つ', async () => {
    let clicked = 0
    render(
      <Button
        busy
        onClick={() => {
          clicked += 1
        }}
      >
        保存
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    // disabled 属性を使うとフォーカスを失い、状態変化が読み上げられない
    expect(button.hasAttribute('disabled')).toBe(false)
    await userEvent.click(button)
    expect(clicked).toBe(0)
  })

  test('variant はデータ属性で表す（クラス名の合成をしない）', () => {
    render(<Button variant="danger">削除</Button>)
    expect(screen.getByRole('button').dataset['variant']).toBe('danger')
  })

  test('variant の既定は primary', () => {
    render(<Button>保存</Button>)
    expect(screen.getByRole('button').dataset['variant']).toBe('primary')
  })
})
