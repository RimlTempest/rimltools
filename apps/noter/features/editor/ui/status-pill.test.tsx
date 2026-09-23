import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import type { ConnectionState } from '@noter/sync/contract'
import type { SaveState } from '../contract/index.ts'
import { statusText } from '../core/status-text.ts'
import { StatusPill } from './status-pill.tsx'

afterEach(cleanup)

const SAVED: SaveState = { kind: 'saved', at: Date.parse('2026-09-06T03:34:00.000Z') }

const pill = (connection: ConnectionState, save: SaveState = SAVED) => {
  const { container } = render(<StatusPill status={statusText(connection, save)} />)
  return container.querySelector('.noter-pill')
}

describe('StatusPill', () => {
  test('状態を色ではなく文言で伝える', () => {
    render(<StatusPill status={statusText({ kind: 'connected' }, SAVED)} />)
    expect(screen.getByText('同期済み · 12:34')).toBeDefined()
  })

  test('接続中は muted', () => {
    expect(pill({ kind: 'connecting' })?.getAttribute('data-tone')).toBe('muted')
  })

  test('同期済みは success', () => {
    expect(pill({ kind: 'connected' })?.getAttribute('data-tone')).toBe('success')
  })

  test('再接続中は warning で試行回数が出る', () => {
    const element = pill({ kind: 'reconnecting', attempt: 3 })
    expect(element?.getAttribute('data-tone')).toBe('warning')
    expect(element?.textContent).toContain('3 回目')
  })

  test('拒否は danger', () => {
    expect(pill({ kind: 'rejected', reason: 'forbidden' })?.getAttribute('data-tone')).toBe(
      'danger',
    )
  })

  /** 読み上げは画面に 1 つだけある LiveRegion が担当する。ピル自身は喋らない。 */
  test('ピル自身は live region にならない', () => {
    const element = pill({ kind: 'offline' })
    expect(element?.getAttribute('role')).toBeNull()
    expect(element?.getAttribute('aria-live')).toBeNull()
  })
})
