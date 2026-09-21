import { describe, expect, test } from 'bun:test'

import { dateRange, parseHostOverrides, resolveTargets } from './config.ts'

describe('parseHostOverrides', () => {
  test('empty or missing means no overrides', () => {
    expect(parseHostOverrides(undefined)).toEqual({ ok: true, value: {} })
    expect(parseHostOverrides('')).toEqual({ ok: true, value: {} })
  })
  test('maps tool names to hosts', () => {
    expect(parseHostOverrides('{"qrcc":"qrcc.riml4i.com"}')).toEqual({
      ok: true,
      value: { qrcc: 'qrcc.riml4i.com' },
    })
  })
  test('rejects malformed JSON and non-string hosts', () => {
    expect(parseHostOverrides('{').ok).toBe(false)
    expect(parseHostOverrides('{"qrcc":1}').ok).toBe(false)
  })
})

describe('resolveTargets', () => {
  const tools = [
    { name: 'qrcc', host: 'qrcc.tools.example.com' },
    { name: 'portal', host: 'tools.example.com' },
  ]
  test('uses the registry host unless overridden (before the DNS cutover)', () => {
    expect(resolveTargets(tools, { qrcc: 'qrcc.example.com' })).toEqual([
      { name: 'qrcc', host: 'qrcc.example.com' },
      { name: 'portal', host: 'tools.example.com' },
    ])
  })
  test('an empty override skips the tool (not live yet)', () => {
    expect(resolveTargets(tools, { portal: '' })).toEqual([
      { name: 'qrcc', host: 'qrcc.tools.example.com' },
    ])
  })
})

describe('dateRange', () => {
  test('returns an inclusive UTC window ending today', () => {
    expect(dateRange(new Date('2026-09-22T00:15:00Z'), 28)).toEqual({
      start: '2026-08-26',
      end: '2026-09-22',
    })
    expect(dateRange(new Date('2026-09-22T23:59:00Z'), 1)).toEqual({
      start: '2026-09-22',
      end: '2026-09-22',
    })
  })
})
