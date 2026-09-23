/**
 * `BEGIN:VEVENT` を含む読み取り内容を解釈する（iCalendar の一部だけ）。
 *
 * 通常は `BEGIN:VCALENDAR` の中に `BEGIN:VEVENT` が入れ子になっているので
 * 「含む」で見分ける（表のとおり）。日時は生の ICS 表記（例:
 * `20260901T090000Z`）のまま持つ。書式を整えるのは UI の関心事ではなく、
 * ここでやると誤った変換をしうるので、この計画ではやらない（YAGNI）。
 */
import type { Interpretation } from '../../contract/interpretation.ts'
import { parseLines } from './lines.ts'

const MARKER = 'BEGIN:VEVENT'

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value

export const interpretVevent = (text: string): Interpretation | undefined => {
  if (!text.toUpperCase().includes(MARKER)) return undefined

  const fields = parseLines(text)

  return {
    kind: 'event',
    summary: emptyToUndefined(fields.get('SUMMARY')),
    start: emptyToUndefined(fields.get('DTSTART')),
    end: emptyToUndefined(fields.get('DTEND')),
    location: emptyToUndefined(fields.get('LOCATION')),
  }
}
