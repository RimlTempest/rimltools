import { describe, expect, test } from 'bun:test'
import { parseDocument } from './parse.ts'
import { convertDocument } from './convert.ts'

const converted = (
  from: 'yaml' | 'toml' | 'json',
  to: 'yaml' | 'toml' | 'json',
  text: string,
): string => {
  const result = convertDocument(from, to, text)
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`)
  return result.value
}

const valueOf = (kind: 'yaml' | 'toml' | 'json', text: string): unknown => {
  const parsed = parseDocument(kind, text)
  if (!parsed.ok || parsed.value.kind !== 'data') throw new Error('expected data')
  return parsed.value.value
}

describe('convertDocument', () => {
  test('yaml → json → yaml で値が一致する（往復しても壊れない）', () => {
    const yaml = 'name: noter\nserver:\n  port: 80\n  hosts:\n    - a\n    - b\n'
    const json = converted('yaml', 'json', yaml)
    const back = converted('json', 'yaml', json)
    expect(valueOf('yaml', back)).toEqual(valueOf('yaml', yaml))
  })

  test('json → toml → json で値が一致する', () => {
    const json = '{"title":"noter","server":{"port":80,"hosts":["a","b"]}}'
    const toml = converted('json', 'toml', json)
    const back = converted('toml', 'json', toml)
    expect(valueOf('json', back)).toEqual(valueOf('json', json))
  })

  test('同じ種別への変換は整形と同じ結果になる', () => {
    expect(converted('json', 'json', '{"a":1}')).toBe('{\n  "a": 1\n}\n')
  })

  test('解析できない入力は指摘つきで失敗する', () => {
    const result = convertDocument('json', 'yaml', '{"a":1')
    expect(result.ok).toBe(false)
    if (result.ok || result.error.reason !== 'parse') return
    expect(result.error.diagnostics.length).toBeGreaterThan(0)
  })

  test('トップレベルが object でないものは toml にできない', () => {
    const result = convertDocument('json', 'toml', '[1, 2]')
    expect(result).toEqual({ ok: false, error: { reason: 'not_object' } })
  })

  test('null を含むものは toml にできない（場所を示す）', () => {
    const result = convertDocument('json', 'toml', '{"a":{"b":null}}')
    expect(result.ok).toBe(false)
    if (result.ok || result.error.reason !== 'null_value') return
    expect(result.error.path).toBe('$.a.b')
  })

  test('配列の中の null も場所を示して弾く', () => {
    const result = convertDocument('json', 'toml', '{"a":[1,null]}')
    expect(result.ok).toBe(false)
    if (result.ok || result.error.reason !== 'null_value') return
    expect(result.error.path).toBe('$.a[1]')
  })

  test('null を含んでいても yaml と json へは変換できる', () => {
    expect(converted('json', 'yaml', '{"a":null}')).toBe('a: null\n')
  })
})
