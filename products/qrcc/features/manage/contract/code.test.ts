import { describe, expect, test } from 'bun:test'
import { parseCodeId, parseFolderId, parseNonEmptyText } from '@qrcc/contract'
import { decodeSavedCode, toCodeDraftWire } from './code.ts'
import { decodeCodeDetail } from './detail.ts'
import { decodeRenderStyle } from './spec.ts'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const id = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))
const folder = expectOk(parseFolderId('fld_0123456789abcdefghjkmnpq'))
const name = expectOk(parseNonEmptyText('在庫ラベル'))

const styleWire = {
  foreground: '#000000',
  background: { kind: 'solid', color: '#ffffff' },
  scale: 6,
  quiet_zone: null,
  module_shape: 'square',
  bar_height: 40,
  human_readable: true,
} as const

const style = expectOk(decodeRenderStyle(styleWire))

const codeWire = {
  id: 'cd_0123456789abcdefghjkmnpq',
  owner_id: 'usr_0123456789abcdefghjkmnpq',
  folder_id: null,
  name: '在庫ラベル',
  kind: 'qr',
  payload: { kind: 'text', text: 'ABC' },
  symbology: { kind: 'qr', ec: 'M' },
  style: styleWire,
  created_at: 1_788_220_800,
  updated_at: 1_788_307_200,
}

describe('decodeSavedCode', () => {
  test('保存された 1 件を読み戻す', () => {
    const decoded = decodeSavedCode(codeWire)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.id).toBe(id)
    expect(decoded.value.name).toBe(name)
    expect(decoded.value.folderId).toBeUndefined()
    expect(decoded.value.payload).toEqual({ kind: 'text', text: 'ABC' })
    expect(decoded.value.symbology).toEqual({ kind: 'qr', ec: 'M' })
    expect(decoded.value.style).toEqual(style)
    expect(decoded.value.createdAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(decoded.value.updatedAt.toISOString()).toBe('2026-09-02T00:00:00.000Z')
  })

  test('JSON 列が壊れていたら失敗にする（握りつぶさない）', () => {
    expect(decodeSavedCode({ ...codeWire, payload: { kind: 'payment' } }).ok).toBe(false)
    expect(decodeSavedCode({ ...codeWire, symbology: { kind: 'qr', ec: 'Z' } }).ok).toBe(false)
    expect(decodeSavedCode({ ...codeWire, style: {} }).ok).toBe(false)
    expect(decodeSavedCode({ ...codeWire, owner_id: 'nope' }).ok).toBe(false)
  })
})

describe('toCodeDraftWire', () => {
  test('保存する内容をそのまま JSON 列に載る形にする', () => {
    expect(
      toCodeDraftWire({
        id,
        name,
        folderId: folder,
        payload: { kind: 'text', text: 'ABC' },
        symbology: { kind: 'qr', ec: 'M' },
        style,
      }),
    ).toEqual({
      id,
      name,
      folder_id: folder,
      payload: { kind: 'text', text: 'ABC' },
      symbology: { kind: 'qr', ec: 'M' },
      style,
    })
  })

  test('フォルダ未所属は null で送る', () => {
    const wire = toCodeDraftWire({
      id,
      name,
      folderId: undefined,
      payload: { kind: 'text', text: 'ABC' },
      symbology: { kind: 'qr', ec: 'M' },
      style,
    })
    expect(wire).toMatchObject({ folder_id: null })
  })
})

describe('decodeCodeDetail', () => {
  test('コード本体と、そのコードの共有リンクを一度に読む', () => {
    const decoded = decodeCodeDetail({
      code: codeWire,
      shares: [
        {
          token: 'abcdefghjkmnpqrstvwxyz0123456789',
          code_id: 'cd_0123456789abcdefghjkmnpq',
          permission: 'view',
          expires_at: 1_790_899_200,
          created_at: 1_788_307_200,
          revoked_at: null,
        },
      ],
    })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.code.id).toBe(id)
    expect(decoded.value.shares).toHaveLength(1)
    expect(decoded.value.shares[0]?.permission).toBe('view')
  })

  test('共有リンクが壊れていれば全体を失敗にする', () => {
    expect(decodeCodeDetail({ code: codeWire, shares: [{ token: 'short' }] }).ok).toBe(false)
    expect(decodeCodeDetail({ code: codeWire }).ok).toBe(false)
  })
})
