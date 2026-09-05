import { describe, expect, test } from 'bun:test'
import { parseNonEmptyText } from '@qrcc/contract'
import { buildEventPayload, parseCalendarTimestamp } from './event.ts'

describe('buildEventPayload', () => {
  test('件名・開始・終了・場所から組み立てる', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026-09-06T10:00',
      end: '2026-09-06T11:00',
      location: '会議室A',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const subject = parseNonEmptyText('定例会議')
    const start = parseCalendarTimestamp('2026-09-06T10:00')
    const end = parseCalendarTimestamp('2026-09-06T11:00')
    expect(subject.ok).toBe(true)
    expect(start.ok).toBe(true)
    expect(end.ok).toBe(true)
    if (subject.ok && start.ok && end.ok) {
      expect(result.value).toEqual({
        kind: 'event',
        event: {
          subject: subject.value,
          start: start.value,
          end: end.value,
          location: '会議室A',
        },
      })
    }
  })

  test('場所は空のままにできる', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026-09-06T10:00',
      end: '2026-09-06T11:00',
      location: '',
    })
    expect(result.ok).toBe(true)
  })

  test('件名が空なら失敗する', () => {
    const result = buildEventPayload({
      subject: '',
      start: '2026-09-06T10:00',
      end: '2026-09-06T11:00',
      location: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_subject')
  })

  test('開始日時の形式が不正なら失敗する', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026/09/06 10:00',
      end: '2026-09-06T11:00',
      location: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_start')
  })

  test('終了日時の形式が不正なら失敗する', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026-09-06T10:00',
      end: 'not-a-date',
      location: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid_end')
  })

  test('終了が開始以前なら失敗する', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026-09-06T11:00',
      end: '2026-09-06T10:00',
      location: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('end_before_start')
  })

  test('終了が開始と同時刻でも失敗する', () => {
    const result = buildEventPayload({
      subject: '定例会議',
      start: '2026-09-06T10:00',
      end: '2026-09-06T10:00',
      location: '',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('end_before_start')
  })
})
