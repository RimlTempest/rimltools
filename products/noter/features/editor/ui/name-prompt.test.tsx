import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamePrompt } from './name-prompt.tsx'

afterEach(cleanup)

describe('NamePrompt', () => {
  test('既定の名前が入った状態で聞く', () => {
    render(<NamePrompt open defaultName="ゲスト-1a2b" onDecide={() => {}} onSkip={() => {}} />)
    expect(screen.getByLabelText('表示名')).toHaveProperty('value', 'ゲスト-1a2b')
  })

  test('入力した名前を返す', async () => {
    const decided: string[] = []
    render(
      <NamePrompt
        open
        defaultName="ゲスト-1a2b"
        onDecide={(n) => decided.push(n)}
        onSkip={() => {}}
      />,
    )
    const field = screen.getByLabelText('表示名')
    await userEvent.clear(field)
    await userEvent.type(field, '山田')
    await userEvent.click(screen.getByRole('button', { name: 'この名前で参加' }))
    expect(decided).toEqual(['山田'])
  })

  test('スキップできる（名乗らなくても編集できる）', async () => {
    let skipped = false
    render(
      <NamePrompt
        open
        defaultName="ゲスト-1a2b"
        onDecide={() => {}}
        onSkip={() => {
          skipped = true
        }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '名乗らずに続ける' }))
    expect(skipped).toBe(true)
  })

  test('閉じているときは中身を出さない', () => {
    render(
      <NamePrompt open={false} defaultName="ゲスト-1a2b" onDecide={() => {}} onSkip={() => {}} />,
    )
    expect(screen.queryByLabelText('表示名')).toBeNull()
  })
})
