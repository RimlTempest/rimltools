import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProposalPanel } from './proposal-panel.tsx'

afterEach(cleanup)

const noop = () => {}

describe('ProposalPanel', () => {
  test('閉じているときは何も出さない', () => {
    render(<ProposalPanel open={false} current="a" proposed="b" onApply={noop} onDiscard={noop} />)
    expect(screen.queryByRole('complementary', { name: '編集の提案' })).toBeNull()
  })

  test('開くと「編集の提案」として読める', () => {
    render(<ProposalPanel open current="a" proposed="b" onApply={noop} onDiscard={noop} />)
    expect(screen.getByRole('complementary', { name: '編集の提案' })).toBeTruthy()
  })

  test('差分を削除行と追加行で見せる', () => {
    render(
      <ProposalPanel
        open
        current={'a\nb\nc'}
        proposed={'a\nB\nc'}
        onApply={noop}
        onDiscard={noop}
      />,
    )
    const panel = screen.getByRole('complementary', { name: '編集の提案' })
    expect([...panel.querySelectorAll('del')].map((node) => node.textContent)).toEqual(['b'])
    expect([...panel.querySelectorAll('ins')].map((node) => node.textContent)).toEqual(['B'])
  })

  /** 色だけで「追加／削除」を伝えない（1.4.1）。読み上げにも語で載せる。 */
  test('追加と削除は語でも伝える', () => {
    render(
      <ProposalPanel
        open
        current={'a\nb\nc'}
        proposed={'a\nB\nc'}
        onApply={noop}
        onDiscard={noop}
      />,
    )
    const panel = screen.getByRole('complementary', { name: '編集の提案' })
    expect(panel.textContent).toContain('削除')
    expect(panel.textContent).toContain('追加')
  })

  /** ADR-0012: 人が「適用」を押すまで文書に触れない。 */
  test('描画しただけでは適用しない', () => {
    const applied: string[] = []
    render(
      <ProposalPanel
        open
        current="a"
        proposed="b"
        onApply={(text) => applied.push(text)}
        onDiscard={noop}
      />,
    )
    expect(applied).toEqual([])
  })

  test('「適用」を押すと提案の本文を渡す', async () => {
    const applied: string[] = []
    render(
      <ProposalPanel
        open
        current="a"
        proposed={'a\nb'}
        onApply={(text) => applied.push(text)}
        onDiscard={noop}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '提案を適用' }))
    expect(applied).toEqual(['a\nb'])
  })

  test('「破棄」を押すと閉じる側に伝える', async () => {
    let discarded = false
    const onDiscard = () => {
      discarded = true
    }
    render(<ProposalPanel open current="a" proposed="b" onApply={noop} onDiscard={onDiscard} />)
    await userEvent.click(screen.getByRole('button', { name: '提案を破棄' }))
    expect(discarded).toBe(true)
  })

  test('提案が現在の本文と同じなら、その旨を伝えて適用を出さない', () => {
    render(<ProposalPanel open current="a" proposed="a" onApply={noop} onDiscard={noop} />)
    const panel = screen.getByRole('complementary', { name: '編集の提案' })
    expect(panel.textContent).toContain('変わりません')
    expect(screen.queryByRole('button', { name: '提案を適用' })).toBeNull()
  })
})
