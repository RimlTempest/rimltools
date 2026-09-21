import { describe, expect, test } from 'bun:test'
import { parseFolderId, parseNonEmptyText } from '@qrcc/contract'
import { decodeFolderList, toFolderDraftWire } from './folder.ts'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const id = expectOk(parseFolderId('fld_0123456789abcdefghjkmnpq'))
const name = expectOk(parseNonEmptyText('仕事'))

describe('decodeFolderList', () => {
  test('フォルダ一覧を読む', () => {
    const decoded = decodeFolderList({
      items: [{ id: 'fld_0123456789abcdefghjkmnpq', name: '仕事', updated_at: 1_788_220_800 }],
    })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value).toHaveLength(1)
    expect(decoded.value[0]?.id).toBe(id)
    expect(decoded.value[0]?.name).toBe(name)
  })

  test('壊れた行があれば一覧ごと失敗にする', () => {
    expect(decodeFolderList({ items: [{ id: 'nope', name: '仕事', updated_at: 0 }] }).ok).toBe(
      false,
    )
    expect(
      decodeFolderList({ items: [{ id: 'fld_0123456789abcdefghjkmnpq', name: ' ' }] }).ok,
    ).toBe(false)
    expect(decodeFolderList({}).ok).toBe(false)
  })
})

describe('toFolderDraftWire', () => {
  test('発行済みの id と名前を送る', () => {
    expect(toFolderDraftWire({ id, name })).toEqual({ id, name })
  })
})
