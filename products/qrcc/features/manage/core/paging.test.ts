import { describe, expect, test } from 'bun:test'
import { parseCodeId, parseNonEmptyText } from '@qrcc/contract'
import type { CodeSummary } from '@qrcc/manage/contract'
import { appendPage, firstPage, hasMore, removeCode, restoreCode } from './paging.ts'

const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const summary = (suffix: string, name: string): CodeSummary => ({
  id: expectOk(parseCodeId(`cd_0123456789abcdefghjkmn${suffix}`)),
  name: expectOk(parseNonEmptyText(name)),
  symbologyKind: 'qr',
  folderId: undefined,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
})

const first = summary('pq', '1 番目')
const second = summary('pr', '2 番目')

describe('ページの積み重ね', () => {
  test('最初のページはそのまま状態になる', () => {
    const state = firstPage({ items: [first], nextCursor: 'next' })
    expect(state.items).toEqual([first])
    expect(hasMore(state)).toBe(true)
  })

  test('次のページは後ろに足される', () => {
    const state = appendPage(firstPage({ items: [first], nextCursor: 'next' }), {
      items: [second],
      nextCursor: undefined,
    })
    expect(state.items.map((item) => item.name)).toEqual([first.name, second.name])
    expect(hasMore(state)).toBe(false)
  })

  /**
   * 読み込み中に他の端末で更新されると、同じ行が 2 ページに現れうる。
   * key が重複すると描画が壊れるので、後から来たほうを捨てる。
   */
  test('同じコードが 2 ページに現れても重複させない', () => {
    const state = appendPage(firstPage({ items: [first], nextCursor: 'next' }), {
      items: [first, second],
      nextCursor: undefined,
    })
    expect(state.items).toHaveLength(2)
  })
})

describe('削除と取り消し', () => {
  test('削除した行は一覧から消える', () => {
    const state = removeCode(firstPage({ items: [first, second], nextCursor: undefined }), first.id)
    expect(state.items).toEqual([second])
  })

  /** 取り消しは「元あった場所」に戻す。順番が変わると見失う。 */
  test('取り消すと元の位置に戻る', () => {
    const listed = firstPage({ items: [first, second], nextCursor: undefined })
    const deleted = removeCode(listed, first.id)
    expect(restoreCode(deleted, first, 0).items).toEqual([first, second])
  })

  test('取り消しても重複しない', () => {
    const listed = firstPage({ items: [first, second], nextCursor: undefined })
    expect(restoreCode(listed, first, 0).items).toHaveLength(2)
  })

  test('知らないコードを削除しても一覧は変わらない', () => {
    const listed = firstPage({ items: [second], nextCursor: undefined })
    expect(removeCode(listed, first.id).items).toEqual([second])
  })
})
