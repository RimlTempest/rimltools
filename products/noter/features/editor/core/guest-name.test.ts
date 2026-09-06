import { describe, expect, test } from 'bun:test'
import type { Actor } from '@noter/auth/contract'
import { parseUserId } from '@noter/contract'
import { guestDisplayName, shouldPromptName } from './guest-name.ts'

const userId = (tail: string) => {
  const parsed = parseUserId(`usr_${tail.padStart(24, '0')}`)
  if (!parsed.ok) throw new Error(`fixture is broken: ${tail}`)
  return parsed.value
}

const guest = (displayName: string): Actor => ({
  kind: 'guest',
  userId: userId('1'),
  displayName,
  sessionExpiresAt: new Date('2026-10-06T00:00:00.000Z'),
})

describe('guestDisplayName', () => {
  test('「ゲスト-」と 4 文字の接尾辞になる', () => {
    expect(guestDisplayName('usr_000000000000000000000001')).toMatch(/^ゲスト-[0-9a-z]{4}$/)
  })

  test('同じ人には常に同じ名前を出す', () => {
    expect(guestDisplayName('usr_a')).toBe(guestDisplayName('usr_a'))
    expect(guestDisplayName('usr_a')).not.toBe(guestDisplayName('usr_b'))
  })
})

describe('shouldPromptName', () => {
  test('人の文書に参加した、名前をまだ決めていないゲストには聞く', () => {
    expect(shouldPromptName(guest('ゲスト'), undefined, true)).toBe(true)
    expect(shouldPromptName(guest(''), undefined, true)).toBe(true)
  })

  /** 「開いた瞬間に書ける」（ux.md §2 原則 1）。自分の文書に問いを挟まない。 */
  test('自分で作った文書を開いただけなら聞かない', () => {
    expect(shouldPromptName(guest('ゲスト'), undefined, false)).toBe(false)
  })

  test('この端末で一度決めていれば聞かない（3.3.7 冗長な入力）', () => {
    expect(shouldPromptName(guest('ゲスト'), '山田', true)).toBe(false)
  })

  test('自分で名前を付けたゲストには聞かない', () => {
    expect(shouldPromptName(guest('山田'), undefined, true)).toBe(false)
  })

  test('ログイン済み・セッション無しには聞かない', () => {
    const user: Actor = { kind: 'user', userId: userId('2'), displayName: 'ゲスト' }
    expect(shouldPromptName(user, undefined, true)).toBe(false)
    expect(shouldPromptName({ kind: 'visitor' }, undefined, true)).toBe(false)
  })
})
