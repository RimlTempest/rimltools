import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Avatar } from './avatar.tsx'

afterEach(cleanup)

describe('Avatar', () => {
  test('名前の 1 文字目を出す', () => {
    render(<Avatar name="山田" colorIndex={0} />)
    expect(screen.getByText('山')).toBeDefined()
  })

  test('絵文字の名前でも 1 文字（サロゲートペアを割らない）', () => {
    render(<Avatar name="🙂さん" colorIndex={1} />)
    expect(screen.getByText('🙂')).toBeDefined()
  })

  test('名前が空でも落ちない', () => {
    const { container } = render(<Avatar name="" colorIndex={2} />)
    expect(container.querySelector('.rd-avatar')).not.toBeNull()
  })

  /** 形は riml-ds の `.rd-avatar`（atoms.css）。参加者の色は noter の CSS が data-presence で重ねる。 */
  test('riml-ds のアバターの形を使う', () => {
    const { container } = render(<Avatar name="鈴木" colorIndex={4} />)
    const avatar = container.querySelector('span')
    expect(avatar?.className).toBe('rd-avatar')
  })

  /** 色は装飾。名前は必ず隣に置くので、アバター自体は読み上げない。 */
  test('支援技術からは隠す', () => {
    const { container } = render(<Avatar name="佐藤" colorIndex={3} />)
    const avatar = container.querySelector('.rd-avatar')
    expect(avatar?.getAttribute('aria-hidden')).toBe('true')
    expect(avatar?.getAttribute('data-presence')).toBe('3')
  })
})
