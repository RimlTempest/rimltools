import { describe, expect, test } from 'bun:test'
import { resolveJoinedRole } from './join.ts'

describe('resolveJoinedRole', () => {
  test('初めて参加する人はリンクの権限になる', () => {
    expect(resolveJoinedRole(undefined, 'viewer')).toBe('viewer')
    expect(resolveJoinedRole(undefined, 'editor')).toBe('editor')
  })

  test('既存メンバーの権限を下げない（ADR-0011）', () => {
    expect(resolveJoinedRole('owner', 'viewer')).toBe('owner')
    expect(resolveJoinedRole('editor', 'viewer')).toBe('editor')
  })

  test('リンクの方が強ければ上げる', () => {
    expect(resolveJoinedRole('viewer', 'editor')).toBe('editor')
  })

  test('同じ権限なら変わらない', () => {
    expect(resolveJoinedRole('editor', 'editor')).toBe('editor')
  })
})
