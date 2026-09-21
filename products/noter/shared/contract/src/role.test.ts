import { describe, expect, test } from 'bun:test'
import { ROLES, higherRole, parseRole } from './role.ts'
import { isErr } from './result.ts'

describe('parseRole', () => {
  test('3 つの権限を受け付ける', () => {
    for (const role of ROLES) {
      const parsed = parseRole(role)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toBe(role)
    }
  })

  test('知らない権限を拒否する', () => {
    expect(isErr(parseRole('admin'))).toBe(true)
    expect(isErr(parseRole(''))).toBe(true)
    expect(isErr(parseRole('Owner'))).toBe(true)
  })

  test('エラーは受け付ける権限を持つ', () => {
    const parsed = parseRole('admin')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('invalid_role')
      expect(parsed.error.expected).toContain('owner')
      expect(parsed.error.received).toBe('admin')
    }
  })
})

describe('higherRole', () => {
  test('owner > editor > viewer の順に強い', () => {
    expect(higherRole('owner', 'editor')).toBe('owner')
    expect(higherRole('editor', 'owner')).toBe('owner')
    expect(higherRole('owner', 'viewer')).toBe('owner')
    expect(higherRole('viewer', 'owner')).toBe('owner')
    expect(higherRole('editor', 'viewer')).toBe('editor')
    expect(higherRole('viewer', 'editor')).toBe('editor')
  })

  test('同じ権限ならそのまま返す', () => {
    for (const role of ROLES) {
      expect(higherRole(role, role)).toBe(role)
    }
  })
})
