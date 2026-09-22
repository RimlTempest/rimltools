import { describe, expect, test } from 'bun:test'
import { parseDocument } from './parse.ts'

const errorsOf = (result: ReturnType<typeof parseDocument>) => (result.ok ? [] : result.error)

describe('parseDocument（markdown）', () => {
  test('markdown は常に成功する（構文エラーの概念がない）', () => {
    expect(parseDocument('markdown', '# 見出し\n\n> 引用')).toEqual({
      ok: true,
      value: { kind: 'markdown' },
    })
  })

  test('空文書でも成功する', () => {
    expect(parseDocument('markdown', '')).toEqual({ ok: true, value: { kind: 'markdown' } })
  })
})

describe('parseDocument（yaml）', () => {
  test('正常な yaml は JsonValue に正規化される', () => {
    const result = parseDocument('yaml', 'name: noter\nitems:\n  - a\n  - b\n')
    expect(result).toEqual({
      ok: true,
      value: { kind: 'data', value: { name: 'noter', items: ['a', 'b'] } },
    })
  })

  test('空文書は null として成功する', () => {
    expect(parseDocument('yaml', '')).toEqual({ ok: true, value: { kind: 'data', value: null } })
  })

  test('4 行目のタブインデントを 4 行 1 列として報告する（1 行目に丸めない）', () => {
    const text = ['name: noter', 'items:', '  - a', '\tbad: 1', ''].join('\n')
    const [first] = errorsOf(parseDocument('yaml', text))
    expect(first).toBeDefined()
    expect(first?.line).toBe(4)
    expect(first?.column).toBe(1)
    expect(first?.source).toBe('yaml')
    expect(first?.severity).toBe('error')
    expect(first?.hint).toContain('タブ')
  })

  test('3 行目 4 列の書き間違いを、行と列の両方で報告する', () => {
    const text = ['a: 1', 'b: 2', 'c: d: e', 'f: 4', ''].join('\n')
    const [first] = errorsOf(parseDocument('yaml', text))
    expect(first?.line).toBe(3)
    expect(first?.column).toBe(4)
  })

  test('3 行目の重複キーを 3 行 1 列として報告する', () => {
    const text = ['a: 1', 'b: 2', 'a: 3', ''].join('\n')
    const [first] = errorsOf(parseDocument('yaml', text))
    expect(first?.line).toBe(3)
    expect(first?.column).toBe(1)
  })

  test('メッセージから「at line N, column M」以降の装飾を落とす', () => {
    const text = ['a: 1', 'b: 2', 'a: 3', ''].join('\n')
    const [first] = errorsOf(parseDocument('yaml', text))
    expect(first?.message).not.toContain('at line')
    expect(first?.message.length).toBeGreaterThan(0)
  })

  test('直し方（hint）を必ず添える', () => {
    const text = ['a: 1', 'b: 2', 'a: 3', ''].join('\n')
    const [first] = errorsOf(parseDocument('yaml', text))
    expect(first?.hint).toBeDefined()
  })
})

describe('parseDocument（toml）', () => {
  test('正常な toml は JsonValue に正規化される', () => {
    const result = parseDocument('toml', 'title = "noter"\n\n[server]\nport = 80\n')
    expect(result).toEqual({
      ok: true,
      value: { kind: 'data', value: { title: 'noter', server: { port: 80 } } },
    })
  })

  test('datetime は ISO 文字列になる', () => {
    const result = parseDocument('toml', 'when = 1979-05-27T07:32:00Z\n')
    expect(result).toEqual({
      ok: true,
      value: { kind: 'data', value: { when: '1979-05-27T07:32:00.000Z' } },
    })
  })

  test('4 行目の壊れた行を 4 行 1 列として報告する', () => {
    const text = ['title = "a"', '[server]', 'port = 80', 'bad line here', ''].join('\n')
    const [first] = errorsOf(parseDocument('toml', text))
    expect(first?.line).toBe(4)
    expect(first?.column).toBe(1)
    expect(first?.source).toBe('toml')
  })

  test('メッセージは 1 行目だけにする（ライブラリのコードブロックを載せない）', () => {
    const text = ['title = "a"', '[server]', 'port = 80', 'bad line here', ''].join('\n')
    const [first] = errorsOf(parseDocument('toml', text))
    expect(first?.message).not.toContain('\n')
    expect(first?.hint).toBeDefined()
  })

  test('空文書は空オブジェクトとして成功する', () => {
    expect(parseDocument('toml', '')).toEqual({ ok: true, value: { kind: 'data', value: {} } })
  })
})

describe('parseDocument（json）', () => {
  test('正常な json は JsonValue になる', () => {
    const result = parseDocument('json', '{"a": 1, "b": [true, null]}')
    expect(result).toEqual({
      ok: true,
      value: { kind: 'data', value: { a: 1, b: [true, null] } },
    })
  })

  test('4 行目で閉じ括弧が足りないことを 4 行 1 列として報告する', () => {
    const text = ['{', '  "a": 1,', '  "b": [1, 2', '}', ''].join('\n')
    const [first] = errorsOf(parseDocument('json', text))
    expect(first?.line).toBe(4)
    expect(first?.column).toBe(1)
    expect(first?.source).toBe('json')
  })

  test('同じ位置に重なる指摘は 1 件にまとめる', () => {
    const text = ['{', '  "a": 1,', '  "b": [1, 2', '}', ''].join('\n')
    const diagnostics = errorsOf(parseDocument('json', text))
    const positions = diagnostics.map((d) => `${d.line}:${d.column}`)
    expect(new Set(positions).size).toBe(positions.length)
  })

  test('閉じ括弧が無いだけの短い文書は 1 件だけ報告する', () => {
    const diagnostics = errorsOf(parseDocument('json', '{"a":1'))
    expect(diagnostics).toHaveLength(1)
  })

  test('JSON にコメントは書けない', () => {
    const diagnostics = errorsOf(parseDocument('json', '{\n  // メモ\n  "a": 1\n}\n'))
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0]?.line).toBe(2)
  })

  test('末尾のカンマは許さない', () => {
    const diagnostics = errorsOf(parseDocument('json', '{\n  "a": 1,\n}\n'))
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  test('空文書は「内容が空」として報告する', () => {
    const diagnostics = errorsOf(parseDocument('json', ''))
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.line).toBe(1)
    expect(diagnostics[0]?.hint).toBeDefined()
  })
})
