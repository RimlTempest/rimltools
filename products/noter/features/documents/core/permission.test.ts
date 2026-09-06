import { describe, expect, test } from 'bun:test'
import { ROLES } from '@noter/contract'
import type { Role } from '@noter/contract'
import { ACTIONS, can, roleForActor } from './permission.ts'
import type { Action } from './permission.ts'
import { userId } from './tests/fixtures.ts'

const OWNER = userId('1')
const OTHER = userId('2')

/**
 * docs/domain-model.md §権限表の写し。表を直したらここも直す。
 * 24 セル（8 action × 3 role）すべてを 1 件ずつ検証する。
 */
const EXPECTED: { readonly [R in Role]: { readonly [A in Action]: boolean } } = {
  owner: {
    read: true,
    edit: true,
    presence: true,
    rename: true,
    share: true,
    remove_member: true,
    delete: true,
    export_raw: true,
  },
  editor: {
    read: true,
    edit: true,
    presence: true,
    rename: true,
    share: false,
    remove_member: false,
    delete: false,
    export_raw: true,
  },
  viewer: {
    read: true,
    edit: false,
    presence: false,
    rename: false,
    share: false,
    remove_member: false,
    delete: false,
    export_raw: true,
  },
}

const cells = ROLES.flatMap((role) => ACTIONS.map((action) => ({ role, action })))

describe('can', () => {
  test('権限表のセルを 24 件すべて覆っている', () => {
    expect(cells).toHaveLength(24)
  })

  test.each(cells)('$role の $action が権限表どおり', ({ role, action }) => {
    expect(can(role, action)).toBe(EXPECTED[role][action])
  })
})

describe('roleForActor', () => {
  const active = { ownerId: OWNER, deletedAt: undefined }

  test('所有者はメンバー行が無くても owner', () => {
    expect(roleForActor(OWNER, active, undefined)).toBe('owner')
  })

  test('メンバー行の役割をそのまま返す', () => {
    expect(roleForActor(OTHER, active, { userId: OTHER, role: 'viewer' })).toBe('viewer')
  })

  test('非メンバーには役割が無い', () => {
    expect(roleForActor(OTHER, active, undefined)).toBeUndefined()
  })

  test('削除済みの文書は所有者でも役割が無い（一覧非表示・404・4404）', () => {
    const deleted = { ownerId: OWNER, deletedAt: new Date('2026-09-06T00:00:00Z') }
    expect(roleForActor(OWNER, deleted, { userId: OWNER, role: 'owner' })).toBeUndefined()
  })
})
