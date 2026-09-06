/**
 * 文書に対する権限。何ができるかの表は docs/domain-model.md §権限表
 * （実装は plan 004 の `features/documents/core/permission.ts`）。
 */
import type { Result } from './result.ts'
import { err, ok } from './result.ts'

export const ROLES = ['owner', 'editor', 'viewer'] as const

export type Role = (typeof ROLES)[number]

export type RoleParseError = {
  readonly kind: 'invalid_role'
  readonly expected: readonly Role[]
  readonly received: string
}

const isRole = (value: string): value is Role => ROLES.some((candidate) => candidate === value)

export const parseRole = (value: string): Result<Role, RoleParseError> =>
  isRole(value) ? ok(value) : err({ kind: 'invalid_role', expected: ROLES, received: value })

/** 強い順の序列。比較のためだけに使い、外には出さない。 */
const RANK: { readonly [K in Role]: number } = { owner: 3, editor: 2, viewer: 1 }

/**
 * 高い方を返す。共有リンクで再入場したときに、既存メンバーの権限を
 * リンクの権限まで**下げない**ために使う（ADR-0011）。
 */
export const higherRole = (a: Role, b: Role): Role => (RANK[a] >= RANK[b] ? a : b)
