import { describe, expect, test } from 'bun:test'
import { parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import { toNdefRecords } from './records.ts'

const url = () => {
  const parsed = parseHttpUrl('https://qrcc.riml4i.com')
  if (!parsed.ok) throw new Error('fixture url must be valid')
  return parsed.value
}

const text = () => {
  const parsed = parseNonEmptyText('こんにちは')
  if (!parsed.ok) throw new Error('fixture text must be valid')
  return parsed.value
}

describe('toNdefRecords', () => {
  test('url は recordType: url の 1 件になる', () => {
    const records = toNdefRecords({ kind: 'url', url: url() })
    expect(records).toEqual([{ recordType: 'url', data: 'https://qrcc.riml4i.com' }])
  })

  test('text は recordType: text の 1 件になる', () => {
    const records = toNdefRecords({ kind: 'text', text: text() })
    expect(records).toEqual([{ recordType: 'text', data: 'こんにちは' }])
  })
})
