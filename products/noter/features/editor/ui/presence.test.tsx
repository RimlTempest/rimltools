import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { Peer } from '../contract/index.ts'
import { Presence } from './presence.tsx'

afterEach(cleanup)

const peer = (clientId: number, name: string): Peer => ({
  clientId,
  name,
  colorIndex: clientId % 8,
})

const FOUR: readonly Peer[] = [peer(1, '山田'), peer(2, '佐藤'), peer(3, '鈴木'), peer(4, '田中')]

const THREE = FOUR.slice(0, 3)
const NOBODY: readonly Peer[] = []

describe('Presence', () => {
  test('4 人いるとアバターは 3 つで残りは +1 になる', () => {
    const { container } = render(<Presence peers={FOUR} />)
    expect(container.querySelectorAll('.noter-presence__avatars .noter-avatar')).toHaveLength(3)
    expect(screen.getByText('+1')).toBeDefined()
  })

  test('3 人までなら +N を出さない', () => {
    render(<Presence peers={THREE} />)
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  test('全員の名前を一覧で読める', () => {
    render(<Presence peers={FOUR} />)
    const list = screen.getByRole('list', { name: '参加者' })
    expect(list.querySelectorAll('li')).toHaveLength(4)
    expect(list.textContent).toContain('田中')
  })

  /** 色だけで人を識別させない（DESIGN.md §2.2）。 */
  test('ボタンの名前は見えている文言と一致する', () => {
    render(<Presence peers={FOUR} />)
    expect(screen.getByRole('button', { name: '参加者 4 人' })).toBeDefined()
  })

  test('自分ひとりなら何も出さない', () => {
    const { container } = render(<Presence peers={NOBODY} />)
    expect(container.querySelector('.noter-presence')).toBeNull()
  })
})
