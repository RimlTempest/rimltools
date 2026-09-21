import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewSwitch } from './view-switch.tsx'

afterEach(cleanup)

describe('ViewSwitch', () => {
  test('3 つのボタンのうち押されているのは 1 つだけ', () => {
    render(<ViewSwitch mode="split" onChange={() => {}} />)
    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    expect(pressed[0]?.textContent).toBe('分割')
  })

  test('押すと選んだモードを返す', async () => {
    const chosen: string[] = []
    render(<ViewSwitch mode="editor" onChange={(mode) => chosen.push(mode)} />)
    await userEvent.click(screen.getByRole('button', { name: 'プレビューのみ' }))
    expect(chosen).toEqual(['preview'])
  })

  test('どのモードでもボタンは 3 つ出る（ドラッグに頼らない代替 2.5.7）', () => {
    render(<ViewSwitch mode="preview" onChange={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
