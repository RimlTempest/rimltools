import { describe, expect, test } from 'bun:test'
import { MANAGE_METHODS, decodeManageEnvelope, isManageMethod } from './manage-rpc.ts'

describe('転送してよいメソッド', () => {
  /** 許可制にすることで、server function が任意の RPC の踏み台にならない。 */
  test('管理用のメソッドだけを通す', () => {
    for (const method of MANAGE_METHODS) expect(isManageMethod(method)).toBe(true)
    for (const method of ['render', 'decode', 'health', 'whoami', '', 'codes.'])
      expect(isManageMethod(method)).toBe(false)
  })

  test('docs/api-contract.md の一覧と同じ顔ぶれ', () => {
    expect([...MANAGE_METHODS].toSorted()).toEqual([
      'codes.create',
      'codes.delete',
      'codes.get',
      'codes.list',
      'codes.update',
      'folders.create',
      'folders.delete',
      'folders.list',
      'folders.update',
      'shares.create',
      'shares.resolve',
      'shares.revoke',
    ])
  })
})

describe('封筒の読み取り', () => {
  test('成功をそのまま渡す', () => {
    expect(decodeManageEnvelope({ ok: true, value: { ok: true, value: { items: [] } } })).toEqual({
      ok: true,
      value: { ok: true, value: { items: [] } },
    })
  })

  test('業務上の失敗を判別できる形で渡す', () => {
    const decoded = decodeManageEnvelope({
      ok: true,
      value: { ok: false, error: { kind: 'not_found', resource: 'code' } },
    })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value).toEqual({ ok: false, error: { kind: 'not_found', resource: 'code' } })
  })

  test('通信の失敗は外側で伝える', () => {
    const decoded = decodeManageEnvelope({
      ok: false,
      error: { kind: 'transport', detail: 'boom' },
    })
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error.kind).toBe('transport')
  })

  /** server function の戻り値もネットワーク越しの値。無検証で型を付けない。 */
  test('形の分からない値は通信の失敗として扱う', () => {
    for (const broken of [null, 42, {}, { ok: 'yes' }, { ok: true }, { ok: false }]) {
      expect(decodeManageEnvelope(broken).ok).toBe(false)
    }
  })

  test('知らないエラー種別は握りつぶさない', () => {
    const decoded = decodeManageEnvelope({
      ok: true,
      value: { ok: false, error: { kind: 'teapot' } },
    })
    expect(decoded.ok).toBe(false)
  })
})
