/**
 * 予定の内容の種類。
 *
 * 開始・終了は `<input type="datetime-local">` の値そのまま（`YYYY-MM-DDTHH:mm`）
 * を検証する。この形は 0 埋めの固定長なので、文字列のまま比較しても
 * 時系列の前後が正しく判定できる。
 */
import type { Result } from '@qrcc/contract'
import { err, makeParser, ok, parseNonEmptyText } from '@qrcc/contract'
import type { CalendarTimestamp, CodePayload } from '../../contract/payload.ts'

export type EventError =
  | { readonly kind: 'invalid_subject' }
  | { readonly kind: 'invalid_start' }
  | { readonly kind: 'invalid_end' }
  | { readonly kind: 'end_before_start' }

export type EventPayload = Extract<CodePayload, { readonly kind: 'event' }>

export type EventInput = {
  readonly subject: string
  readonly start: string
  readonly end: string
  readonly location: string
}

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const isCalendarTimestamp = (value: string): value is CalendarTimestamp =>
  TIMESTAMP_PATTERN.test(value)

export type TimestampError = { readonly kind: 'invalid_timestamp' }

/**
 * `datetime-local` の値を検証する。テストや将来の呼び出し元がそのまま
 * `CalendarTimestamp` を作れるように公開している。
 */
export const parseCalendarTimestamp = makeParser(isCalendarTimestamp, (): TimestampError => ({
  kind: 'invalid_timestamp',
}))

export const buildEventPayload = (input: EventInput): Result<EventPayload, EventError> => {
  const subject = parseNonEmptyText(input.subject)
  if (!subject.ok) return err({ kind: 'invalid_subject' })

  const start = parseCalendarTimestamp(input.start)
  if (!start.ok) return err({ kind: 'invalid_start' })

  const end = parseCalendarTimestamp(input.end)
  if (!end.ok) return err({ kind: 'invalid_end' })

  // 0 埋めの固定長形式なので、辞書順の比較がそのまま時系列の比較になる。
  if (end.value <= start.value) return err({ kind: 'end_before_start' })

  return ok({
    kind: 'event',
    event: {
      subject: subject.value,
      start: start.value,
      end: end.value,
      location: input.location,
    },
  })
}
