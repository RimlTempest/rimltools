import { describe, expect, test } from 'bun:test'
import { documentId, shareToken, userId } from '../core/tests/fixtures.ts'
import {
  parseDocumentSummaryWire,
  parseDocumentWire,
  parseList,
  parseMemberSummaryWire,
  parseShareLinkWire,
  toDocumentSummaryWire,
  toDocumentWire,
  toMemberSummaryWire,
  toShareLinkWire,
} from './wire.ts'

const UPDATED_AT = new Date('2026-09-06T03:04:05.000Z')

describe('DocumentSummary', () => {
  const summary = {
    id: documentId('1'),
    title: '設計メモ',
    kind: 'markdown',
    role: 'owner',
    updatedAt: UPDATED_AT,
  } as const

  test('往復しても同じ値になる', () => {
    expect(parseDocumentSummaryWire(toDocumentSummaryWire(summary))).toEqual(summary)
  })

  test('壊れた ID は読み捨てる', () => {
    expect(
      parseDocumentSummaryWire({ ...toDocumentSummaryWire(summary), id: 'nope' }),
    ).toBeUndefined()
  })

  test('壊れた日時は読み捨てる', () => {
    expect(
      parseDocumentSummaryWire({ ...toDocumentSummaryWire(summary), updatedAt: 'いつか' }),
    ).toBeUndefined()
  })

  test('オブジェクトでなければ読み捨てる', () => {
    expect(parseDocumentSummaryWire('markdown')).toBeUndefined()
  })
})

describe('MemberSummary', () => {
  test('往復しても同じ値になる', () => {
    const member = { userId: userId('1'), displayName: '山田', role: 'editor' } as const
    expect(parseMemberSummaryWire(toMemberSummaryWire(member))).toEqual(member)
  })
})

describe('ShareLink', () => {
  const link = {
    token: shareToken('1'),
    documentId: documentId('1'),
    role: 'viewer',
    createdAt: UPDATED_AT,
    expiresAt: new Date('2026-12-05T00:00:00.000Z'),
  } as const

  test('往復しても同じ値になる', () => {
    expect(parseShareLinkWire(toShareLinkWire(link))).toEqual(link)
  })

  test('無期限は null で運び、undefined に戻る', () => {
    const unlimited = { ...link, expiresAt: undefined }
    expect(toShareLinkWire(unlimited).expiresAt).toBeNull()
    expect(parseShareLinkWire(toShareLinkWire(unlimited))?.expiresAt).toBeUndefined()
  })

  /** owner リンクは存在しない（ADR-0011）。届いても受け付けない。 */
  test('owner の共有リンクは読み捨てる', () => {
    expect(parseShareLinkWire({ ...toShareLinkWire(link), role: 'owner' })).toBeUndefined()
  })
})

describe('Document', () => {
  test('往復しても同じ値になる', () => {
    const header = {
      id: documentId('1'),
      ownerId: userId('1'),
      title: '設計メモ',
      kind: 'yaml',
      updatedAt: UPDATED_AT,
    } as const
    expect(parseDocumentWire(toDocumentWire(header))).toEqual(header)
  })
})

describe('parseList', () => {
  test('読めない行だけを落とす', () => {
    const good = toMemberSummaryWire({ userId: userId('1'), displayName: '山田', role: 'owner' })
    expect(parseList([good, { userId: 'nope' }], parseMemberSummaryWire)).toHaveLength(1)
  })

  test('配列でなければ空', () => {
    expect(parseList(undefined, parseMemberSummaryWire)).toEqual([])
  })
})
