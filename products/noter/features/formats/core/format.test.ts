import { describe, expect, test } from 'bun:test'
import { formatDocument } from './format.ts'

const formatted = (kind: 'yaml' | 'toml' | 'json', text: string): string => {
  const result = formatDocument(kind, text)
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`)
  return result.value
}

describe('formatDocument（markdown）', () => {
  test('markdown は整形の対象外', () => {
    expect(formatDocument('markdown', '#   見出し')).toEqual({
      ok: false,
      error: { reason: 'unsupported' },
    })
  })
})

describe('formatDocument（json）', () => {
  test('2 スペースインデントにし、末尾に改行を足す', () => {
    expect(formatted('json', '{"a":1,"b":[1,2]}')).toBe(
      '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n',
    )
  })

  test('整形は冪等（2 回かけても変わらない）', () => {
    const once = formatted('json', '{"a":1,"b":{"c":[1,2]}}')
    expect(formatted('json', once)).toBe(once)
  })

  test('壊れた文書は指摘つきで失敗する', () => {
    const result = formatDocument('json', '{"a":1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe('invalid')
    if (result.error.reason !== 'invalid') return
    expect(result.error.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('formatDocument（yaml）', () => {
  test('2 スペースインデントで書き直す', () => {
    expect(formatted('yaml', 'a:   1\nb:\n- x\n- y\n')).toBe('a: 1\nb:\n  - x\n  - y\n')
  })

  test('整形は冪等', () => {
    const once = formatted('yaml', 'b:\n- x\na:   1\n')
    expect(formatted('yaml', once)).toBe(once)
  })

  test('4 行目の壊れた行は指摘つきで失敗する', () => {
    const text = ['name: noter', 'items:', '  - a', '\tbad: 1', ''].join('\n')
    const result = formatDocument('yaml', text)
    expect(result.ok).toBe(false)
    if (result.ok || result.error.reason !== 'invalid') return
    expect(result.error.diagnostics[0]?.line).toBe(4)
  })
})

describe('formatDocument（toml）', () => {
  test('テーブルを揃えて書き直す', () => {
    expect(formatted('toml', 'title="noter"\n[server]\nport=80\n')).toContain('title = "noter"')
  })

  test('整形は冪等', () => {
    const once = formatted('toml', 'title="noter"\n[server]\nport=80\n')
    expect(formatted('toml', once)).toBe(once)
  })

  test('4 行目の壊れた行は指摘つきで失敗する', () => {
    const text = ['title = "a"', '[server]', 'port = 80', 'bad line here', ''].join('\n')
    const result = formatDocument('toml', text)
    expect(result.ok).toBe(false)
    if (result.ok || result.error.reason !== 'invalid') return
    expect(result.error.diagnostics[0]?.line).toBe(4)
  })
})
