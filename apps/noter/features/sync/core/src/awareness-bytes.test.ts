import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { afterEach, describe, expect, test } from 'bun:test'
import { encodeRemoval, readClientIds } from './awareness-bytes.ts'

const openAwareness: Awareness[] = []

const ascending = (left: number, right: number) => left - right

const makeAwareness = (state: Record<string, unknown>) => {
  const doc = new Y.Doc()
  const awareness = new Awareness(doc)
  openAwareness.push(awareness)
  awareness.setLocalState(state)
  return awareness
}

const updateOf = (awareness: Awareness) => encodeAwarenessUpdate(awareness, [awareness.clientID])

afterEach(() => {
  // Awareness は内部にタイマーを持つ。閉じないとテストプロセスが終わらない。
  for (const awareness of openAwareness.splice(0)) awareness.destroy()
})

describe('readClientIds', () => {
  test('本物の awareness update から clientId と clock を読める', () => {
    const awareness = makeAwareness({ name: 'Ada' })
    expect(readClientIds(updateOf(awareness))).toEqual([{ clientId: awareness.clientID, clock: 1 }])
  })

  test('複数の参加者ぶんを順に読む', () => {
    const first = makeAwareness({ name: 'Ada' })
    const second = makeAwareness({ name: 'Grace' })
    applyAwarenessUpdate(first, updateOf(second), 'test')

    const entries = readClientIds(encodeAwarenessUpdate(first, [first.clientID, second.clientID]))
    expect(entries.map((entry) => entry.clientId).toSorted(ascending)).toEqual(
      [first.clientID, second.clientID].toSorted(ascending),
    )
  })

  test('壊れたバイト列では空配列を返す（例外にしない）', () => {
    expect(readClientIds(new Uint8Array([255, 255, 255]))).toEqual([])
    expect(readClientIds(new Uint8Array())).toEqual([])
  })
})

describe('encodeRemoval', () => {
  test('組み立てた removal を適用すると state が消える', () => {
    const leaving = makeAwareness({ name: 'Ada' })
    const observer = makeAwareness({ name: 'Grace' })
    applyAwarenessUpdate(observer, updateOf(leaving), 'test')
    expect(observer.getStates().get(leaving.clientID)).toEqual({ name: 'Ada' })

    applyAwarenessUpdate(observer, encodeRemoval(readClientIds(updateOf(leaving))), 'test')
    expect(observer.getStates().has(leaving.clientID)).toBe(false)
  })

  test('removal は元の clock より進んでいる', () => {
    const leaving = makeAwareness({ name: 'Ada' })
    const removal = readClientIds(encodeRemoval(readClientIds(updateOf(leaving))))
    expect(removal).toEqual([{ clientId: leaving.clientID, clock: 2 }])
  })

  test('参加者がいなければ空の update を組み立てる', () => {
    expect(readClientIds(encodeRemoval([]))).toEqual([])
  })
})
