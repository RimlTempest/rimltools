import { describe, expect, test } from 'bun:test'
import { parseCodeId, parseFolderId, parseNonEmptyText } from '@qrcc/contract'
import {
  CODE_SORTS,
  CODE_SORT_META,
  MAX_PAGE_SIZE,
  decodeCodePage,
  toCodeListWire,
} from './list.ts'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const folderId = expectOk(parseFolderId('fld_0123456789abcdefghjkmnpq'))
const codeId = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))

const summaryWire = {
  id: 'cd_0123456789abcdefghjkmnpq',
  name: '在庫ラベル',
  kind: 'qr',
  folder_id: null,
  updated_at: 1_788_220_800,
}

describe('並べ替えの選択肢', () => {
  test('更新順と名前順の昇降 4 通りをそろえる', () => {
    expect([...CODE_SORTS]).toEqual(['updated_desc', 'updated_asc', 'name_asc', 'name_desc'])
  })

  /** Mapped Type のレジストリ。並べ替えを足したら説明も必ず足すことになる。 */
  test('どの並べ替えにも列・向き・ラベルがある', () => {
    for (const sort of CODE_SORTS) {
      const meta = CODE_SORT_META[sort]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(['name', 'updated']).toContain(meta.column)
      expect(['ascending', 'descending']).toContain(meta.direction)
    }
  })
})

describe('toCodeListWire', () => {
  test('絞り込みと並べ替えを snake_case のワイヤ形式にする', () => {
    expect(
      toCodeListWire({
        folderId,
        query: 'ラベル',
        sort: 'name_asc',
        limit: 20,
        cursor: 'abc',
      }),
    ).toEqual({
      folder_id: folderId,
      query: 'ラベル',
      sort: 'name_asc',
      limit: 20,
      cursor: 'abc',
    })
  })

  test('未指定は null で送る（キーを落とさない）', () => {
    expect(
      toCodeListWire({ folderId: undefined, query: '', sort: 'updated_desc', limit: 20 }),
    ).toEqual({
      folder_id: null,
      query: null,
      sort: 'updated_desc',
      limit: 20,
      cursor: null,
    })
  })

  /** D1 の行読み取りを増やさないための上限（docs/api-contract.md 6 節）。 */
  test('1 ページの上限を超えて要求しない', () => {
    const wire = toCodeListWire({
      folderId: undefined,
      query: undefined,
      sort: 'updated_desc',
      limit: 500,
    })
    expect(wire).toMatchObject({ limit: MAX_PAGE_SIZE })
  })
})

describe('decodeCodePage', () => {
  test('一覧の 1 ページを読む', () => {
    const decoded = decodeCodePage({ items: [summaryWire], next_cursor: 'next' })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.nextCursor).toBe('next')
    expect(decoded.value.items).toHaveLength(1)
    const first = decoded.value.items[0]
    expect(first?.id).toBe(codeId)
    expect(first?.name).toBe(expectOk(parseNonEmptyText('在庫ラベル')))
    expect(first?.symbologyKind).toBe('qr')
    expect(first?.folderId).toBeUndefined()
    expect(first?.updatedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  test('最後のページでは次のカーソルがない', () => {
    const decoded = decodeCodePage({ items: [], next_cursor: null })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value.nextCursor).toBeUndefined()
  })

  test('フォルダに入っていれば FolderId として読む', () => {
    const decoded = decodeCodePage({
      items: [{ ...summaryWire, folder_id: 'fld_0123456789abcdefghjkmnpq' }],
      next_cursor: null,
    })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value.items[0]?.folderId).toBe(folderId)
  })

  test('壊れた行があればページごと失敗にする', () => {
    for (const broken of [
      { ...summaryWire, id: 'usr_0123456789abcdefghjkmnpq' },
      { ...summaryWire, kind: 'maxicode' },
      { ...summaryWire, name: '' },
      { ...summaryWire, updated_at: 'yesterday' },
    ]) {
      expect(decodeCodePage({ items: [broken], next_cursor: null }).ok).toBe(false)
    }
    expect(decodeCodePage({ items: 'nope', next_cursor: null }).ok).toBe(false)
    expect(decodeCodePage(null).ok).toBe(false)
  })
})
