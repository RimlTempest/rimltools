import { describe, expect, test } from 'bun:test'
import { interpretVevent } from './vevent.ts'

describe('interpretVevent', () => {
  test('件名・開始・終了・場所を取り出す', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:定例会議',
      'DTSTART:20260901T090000Z',
      'DTEND:20260901T100000Z',
      'LOCATION:会議室1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(interpretVevent(text)).toEqual({
      kind: 'event',
      summary: '定例会議',
      start: '20260901T090000Z',
      end: '20260901T100000Z',
      location: '会議室1',
    })
  })

  test('VCALENDAR で囲まれていなくても VEVENT を含めば読める', () => {
    const text = ['BEGIN:VEVENT', 'SUMMARY:定例会議', 'END:VEVENT'].join('\n')
    expect(interpretVevent(text)).toEqual({
      kind: 'event',
      summary: '定例会議',
      start: undefined,
      end: undefined,
      location: undefined,
    })
  })

  test('TZID パラメータ付きの DTSTART でも読める', () => {
    const text = ['BEGIN:VEVENT', 'DTSTART;TZID=Asia/Tokyo:20260901T090000', 'END:VEVENT'].join(
      '\n',
    )
    const result = interpretVevent(text)
    expect(result?.kind === 'event' ? result.start : undefined).toBe('20260901T090000')
  })

  test('BEGIN:VEVENT を含まなければ何も返さない', () => {
    expect(interpretVevent('SUMMARY:定例会議')).toBeUndefined()
  })

  /** 壊れた入力: 値が空 */
  test('項目が無ければ undefined になる', () => {
    expect(interpretVevent('BEGIN:VEVENT\nEND:VEVENT')).toEqual({
      kind: 'event',
      summary: undefined,
      start: undefined,
      end: undefined,
      location: undefined,
    })
  })

  /** 壊れた入力: END:VEVENT が無い（途中で切れている） */
  test('END:VEVENT が無くても読める', () => {
    expect(interpretVevent('BEGIN:VEVENT\nSUMMARY:定例会議')).toEqual({
      kind: 'event',
      summary: '定例会議',
      start: undefined,
      end: undefined,
      location: undefined,
    })
  })
})
