import { describe, expect, test } from 'bun:test'

import { formatTraceparent, newSpanId, newTraceId, parseTraceparent } from './tracecontext.ts'

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN = '00f067aa0ba902b7'

describe('parseTraceparent', () => {
  test('parses a sampled W3C traceparent', () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-01`)).toEqual({
      ok: true,
      value: { traceId: TRACE, parentSpanId: SPAN, sampled: true },
    })
  })

  test('reads the sampled bit from the flags', () => {
    const result = parseTraceparent(`00-${TRACE}-${SPAN}-00`)
    expect(result.ok && result.value.sampled).toBe(false)
  })

  test.each([
    ['missing', null],
    ['empty', ''],
    ['short trace id', `00-4bf92f35-${SPAN}-01`],
    ['all-zero trace id', `00-${'0'.repeat(32)}-${SPAN}-01`],
    ['all-zero span id', `00-${TRACE}-${'0'.repeat(16)}-01`],
    ['version ff', `ff-${TRACE}-${SPAN}-01`],
    ['uppercase hex', `00-${TRACE.toUpperCase()}-${SPAN}-01`],
  ])('rejects %s', (_, header) => {
    expect(parseTraceparent(header).ok).toBe(false)
  })

  test('accepts future versions with extra fields', () => {
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-01-extra`).ok).toBe(true)
  })
})

describe('formatTraceparent', () => {
  test('round-trips', () => {
    const header = formatTraceparent({ traceId: TRACE, spanId: SPAN, sampled: true })
    expect(header).toBe(`00-${TRACE}-${SPAN}-01`)
    expect(parseTraceparent(header).ok).toBe(true)
  })

  test('writes 00 flags when not sampled', () => {
    expect(formatTraceparent({ traceId: TRACE, spanId: SPAN, sampled: false })).toEndWith('-00')
  })
})

const fill = (bytes: Uint8Array) => {
  bytes.fill(0xab)
  return bytes
}
const zero = (bytes: Uint8Array) => bytes

describe('id generation', () => {
  test('uses the injected random bytes', () => {
    expect(newTraceId(fill)).toBe('ab'.repeat(16))
    expect(newSpanId(fill)).toBe('ab'.repeat(8))
  })

  test('never returns an all-zero id', () => {
    expect(newTraceId(zero)).not.toBe('0'.repeat(32))
    expect(newSpanId(zero)).not.toBe('0'.repeat(16))
  })
})
