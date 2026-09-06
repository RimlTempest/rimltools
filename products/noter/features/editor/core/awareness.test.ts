import { describe, expect, test } from 'bun:test'
import { localPresenceState, readPeers } from './awareness.ts'

const states = (entries: readonly [number, unknown][]) => entries

describe('readPeers', () => {
  test('自分は含めない', () => {
    expect(
      readPeers(
        states([
          [1, { user: { name: '山田', index: 3 } }],
          [2, { user: { name: '佐藤', index: 5 } }],
        ]),
        1,
      ),
    ).toEqual([{ clientId: 2, name: '佐藤', colorIndex: 5 }])
  })

  test('名前を名乗っていない人は数えない（誰か分からない丸を出さない）', () => {
    expect(readPeers(states([[2, { cursor: null }]]), 1)).toEqual([])
    expect(readPeers(states([[2, { user: { name: '' } }]]), 1)).toEqual([])
  })

  test('壊れた state でも落ちない', () => {
    expect(
      readPeers(
        states([
          [2, null],
          [3, 'x'],
          [4, { user: 7 }],
        ]),
        1,
      ),
    ).toEqual([])
  })

  test('色が読めなければ既定の色に倒す', () => {
    expect(readPeers(states([[2, { user: { name: '佐藤' } }]]), 1)).toEqual([
      { clientId: 2, name: '佐藤', colorIndex: 0 },
    ])
  })

  test('順番は clientId で安定させる（並び替わってちらつかせない）', () => {
    const peers = readPeers(
      states([
        [9, { user: { name: 'c', index: 1 } }],
        [3, { user: { name: 'a', index: 1 } }],
        [5, { user: { name: 'b', index: 1 } }],
      ]),
      1,
    )
    expect(peers.map((peer) => peer.name)).toEqual(['a', 'b', 'c'])
  })
})

describe('localPresenceState', () => {
  test('名前と色をトークン経由で持つ（生の色を書かない）', () => {
    const state = localPresenceState('山田', 4)
    expect(state.name).toBe('山田')
    expect(state.index).toBe(4)
    expect(state.color).toBe('var(--noter-presence-4)')
    expect(state.colorLight).toContain('var(--noter-presence-4)')
  })
})
