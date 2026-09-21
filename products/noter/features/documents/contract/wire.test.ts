import { describe, expect, test } from 'bun:test'
import { documentId, shareToken, userId } from '../core/tests/fixtures.ts'
import {
  parseCreateLinkInput,
  parseDocumentIdInput,
  parseDocumentKindInput,
  parseDocumentSummaryWire,
  parseDocumentWire,
  parseList,
  parseMemberInput,
  parseMemberRoleInput,
  parseMemberSummaryWire,
  parseRenameInput,
  parseShareLinkWire,
  parseShareTokenInput,
  parseTokenInput,
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

/**
 * server function の入力は**ネットワークから届く**ので、呼び出し側の型注釈は
 * 実行時の約束にならない。`.validator()` がここを通し、ハンドラには
 * 検証済みの値だけを渡す。
 */
describe('server function の入力', () => {
  test('文書 ID は形が合うときだけ通る', () => {
    expect(parseDocumentIdInput(documentId('1'))).toBe(documentId('1'))
    expect(parseDocumentIdInput('usr_000000000000000000000001')).toBeUndefined()
    expect(parseDocumentIdInput('doc_')).toBeUndefined()
  })

  test('文字列でない文書 ID は通さない', () => {
    expect(parseDocumentIdInput(42)).toBeUndefined()
    expect(parseDocumentIdInput(undefined)).toBeUndefined()
    expect(parseDocumentIdInput({ toString: () => documentId('1') })).toBeUndefined()
  })

  test('種別は 4 つだけ通る', () => {
    expect(parseDocumentKindInput('markdown')).toBe('markdown')
    expect(parseDocumentKindInput('csv')).toBeUndefined()
    expect(parseDocumentKindInput(null)).toBeUndefined()
  })

  test('共有トークンは形が合うときだけ通る', () => {
    expect(parseShareTokenInput(shareToken('1'))).toBe(shareToken('1'))
    expect(parseShareTokenInput(documentId('1'))).toBeUndefined()
    expect(parseShareTokenInput(['shr'])).toBeUndefined()
  })

  test('表題の変更は文書 ID と文字列の表題を要る', () => {
    expect(parseRenameInput({ documentId: documentId('1'), title: '設計メモ' })).toEqual({
      documentId: documentId('1'),
      title: '設計メモ',
    })
    expect(parseRenameInput({ documentId: 'nope', title: '設計メモ' })).toBeUndefined()
    expect(parseRenameInput({ documentId: documentId('1') })).toBeUndefined()
    expect(parseRenameInput({ documentId: documentId('1'), title: 7 })).toBeUndefined()
    expect(parseRenameInput('設計メモ')).toBeUndefined()
  })

  test('共有リンクの作成は役割と有効期限を検証する', () => {
    expect(
      parseCreateLinkInput({ documentId: documentId('1'), role: 'viewer', expiresInDays: 7 }),
    ).toEqual({ documentId: documentId('1'), role: 'viewer', expiresInDays: 7 })
    // null は無期限。undefined に直して渡す
    expect(
      parseCreateLinkInput({ documentId: documentId('1'), role: 'editor', expiresInDays: null })
        ?.expiresInDays,
    ).toBeUndefined()
    expect(
      parseCreateLinkInput({ documentId: documentId('1'), role: 'admin', expiresInDays: null }),
    ).toBeUndefined()
    // 期限が数でないと Invalid Date が保存されてしまう
    expect(
      parseCreateLinkInput({
        documentId: documentId('1'),
        role: 'viewer',
        expiresInDays: Number.NaN,
      }),
    ).toBeUndefined()
    expect(
      parseCreateLinkInput({ documentId: documentId('1'), role: 'viewer', expiresInDays: 0 }),
    ).toBeUndefined()
    expect(
      parseCreateLinkInput({ documentId: documentId('1'), role: 'viewer', expiresInDays: '7' }),
    ).toBeUndefined()
  })

  test('リンクの失効は文書 ID とトークンを要る', () => {
    expect(parseTokenInput({ documentId: documentId('1'), token: shareToken('1') })).toEqual({
      documentId: documentId('1'),
      token: shareToken('1'),
    })
    expect(parseTokenInput({ documentId: documentId('1'), token: documentId('1') })).toBeUndefined()
    expect(parseTokenInput({ token: shareToken('1') })).toBeUndefined()
  })

  test('参加者の操作は文書 ID と利用者 ID を要る', () => {
    expect(parseMemberInput({ documentId: documentId('1'), userId: userId('1') })).toEqual({
      documentId: documentId('1'),
      userId: userId('1'),
    })
    expect(parseMemberInput({ documentId: documentId('1'), userId: 'nope' })).toBeUndefined()
    expect(parseMemberInput(null)).toBeUndefined()
  })

  test('権限の変更は役割まで検証する', () => {
    expect(
      parseMemberRoleInput({ documentId: documentId('1'), userId: userId('1'), role: 'viewer' }),
    ).toEqual({ documentId: documentId('1'), userId: userId('1'), role: 'viewer' })
    expect(
      parseMemberRoleInput({ documentId: documentId('1'), userId: userId('1'), role: 'admin' }),
    ).toBeUndefined()
    expect(
      parseMemberRoleInput({ documentId: documentId('1'), userId: userId('1') }),
    ).toBeUndefined()
  })
})
