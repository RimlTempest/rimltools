import { describe, expect, test } from 'bun:test'
import type { Peer } from '../contract/index.ts'
import { joinedMessage, leftMessage } from './presence.ts'

const peer = (clientId: number, name: string): Peer => ({ clientId, name, colorIndex: 0 })

const A = peer(1, '山田')
const B = peer(2, '佐藤')

describe('joinedMessage', () => {
  test('増えた人だけを 1 回告げる', () => {
    expect(joinedMessage([A], [A, B])).toBe('佐藤さんが参加しました')
  })

  test('同じ顔ぶれなら何も言わない', () => {
    expect(joinedMessage([A, B], [B, A])).toBeNull()
  })

  test('減っただけなら参加は告げない', () => {
    expect(joinedMessage([A, B], [A])).toBeNull()
  })

  test('複数人が同時に来たらまとめて 1 回', () => {
    expect(joinedMessage([], [A, B])).toBe('山田、佐藤さんが参加しました')
  })
})

describe('leftMessage', () => {
  test('減った人だけを 1 回告げる', () => {
    expect(leftMessage([A, B], [A])).toBe('佐藤さんが退出しました')
  })

  test('同じ顔ぶれなら何も言わない', () => {
    expect(leftMessage([A], [A])).toBeNull()
  })
})
