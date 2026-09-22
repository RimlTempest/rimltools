import { describe, expect, test } from 'bun:test'
import type { ConnectionState } from '@noter/sync/contract'
import type { SaveState, StatusText } from '../contract/index.ts'
import { statusText } from './status-text.ts'

/** 2026-09-06 12:34 JST。ピルの時刻表示に使う。 */
const AT = Date.parse('2026-09-06T03:34:56.000Z')

const SAVED: SaveState = { kind: 'saved', at: AT }
const DIRTY: SaveState = { kind: 'dirty' }

/**
 * docs/design/ux.md §5 の表をそのまま持ってきたもの。
 * 表と実装がずれたらここが落ちる。
 */
const ROWS: readonly {
  readonly name: string
  readonly connection: ConnectionState
  readonly save: SaveState
  readonly expected: StatusText
}[] = [
  {
    name: 'connecting',
    connection: { kind: 'connecting' },
    save: SAVED,
    expected: { label: '接続中…', announce: '接続しています', tone: 'muted' },
  },
  {
    name: 'connected + saved',
    connection: { kind: 'connected' },
    save: SAVED,
    expected: { label: '同期済み · 12:34', announce: '接続しました', tone: 'success' },
  },
  {
    name: 'connected + dirty',
    connection: { kind: 'connected' },
    save: DIRTY,
    expected: { label: '同期中…', announce: null, tone: 'muted' },
  },
  {
    name: 'reconnecting(2)',
    connection: { kind: 'reconnecting', attempt: 2 },
    save: DIRTY,
    expected: {
      label: '再接続中… (2 回目)',
      announce: '再接続しています。編集は続けられます',
      tone: 'warning',
    },
  },
  {
    name: 'offline',
    connection: { kind: 'offline' },
    save: SAVED,
    expected: {
      label: 'オフライン · 端末に保存',
      announce: 'オフラインです。編集はこの端末に保存され、復帰後に送信されます',
      tone: 'warning',
    },
  },
  {
    name: 'rejected(forbidden)',
    connection: { kind: 'rejected', reason: 'forbidden' },
    save: SAVED,
    expected: {
      label: '権限がありません',
      announce: 'この文書の権限が変更されました。再読み込みしてください',
      tone: 'danger',
    },
  },
  {
    name: 'rejected(not_found)',
    connection: { kind: 'rejected', reason: 'not_found' },
    save: SAVED,
    expected: {
      label: '文書が見つかりません',
      announce: '文書が削除されたか、アクセスできません',
      tone: 'danger',
    },
  },
  {
    name: 'rejected(limit)',
    connection: { kind: 'rejected', reason: 'limit' },
    save: SAVED,
    expected: {
      label: '本日の同期上限',
      announce: '本日の同期上限に達しました。編集はこの端末に保存されます',
      tone: 'danger',
    },
  },
]

describe('statusText', () => {
  for (const row of ROWS) {
    test(`${row.name} は ux.md §5 の文言になる`, () => {
      expect(statusText(row.connection, row.save)).toEqual(row.expected)
    })
  }

  /** 表に無い理由でも黙って落とさない（union を網羅する）。 */
  test('表に無い拒否理由にも文言がある', () => {
    for (const reason of ['bad_request', 'too_large'] as const) {
      const result = statusText({ kind: 'rejected', reason }, SAVED)
      expect(result.tone).toBe('danger')
      expect(result.label).not.toBe('')
      expect(result.announce).not.toBeNull()
    }
  })

  test('接続済みの時刻は文書を開いた端末に依らず JST で出す', () => {
    const midnight = Date.parse('2026-09-06T15:05:00.000Z')
    expect(statusText({ kind: 'connected' }, { kind: 'saved', at: midnight }).label).toBe(
      '同期済み · 00:05',
    )
  })

  /** 「保存」は使わない（ux.md §5 の語彙規則）。例外は「端末に保存」だけ。 */
  test('オフライン以外の文言に「保存」を使わない', () => {
    for (const row of ROWS) {
      const result = statusText(row.connection, row.save)
      if (row.connection.kind === 'offline') continue
      if (row.connection.kind === 'rejected' && row.connection.reason === 'limit') continue
      expect(result.label).not.toContain('保存')
    }
  })
})
