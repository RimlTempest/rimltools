import { describe, expect, test } from 'bun:test'
import { diagnose } from './diagnose.ts'

describe('diagnose', () => {
  test('正常な文書では指摘が 0 件', () => {
    expect(diagnose('json', '{"a": 1}')).toEqual([])
    expect(diagnose('yaml', 'a: 1\n')).toEqual([])
    expect(diagnose('toml', 'a = 1\n')).toEqual([])
  })

  test('markdown は常に 0 件', () => {
    expect(diagnose('markdown', '```\n閉じていない')).toEqual([])
  })

  test('壊れた文書では parse と同じ指摘を返す', () => {
    const text = ['{', '  "a": 1,', '  "b": [1, 2', '}', ''].join('\n')
    const diagnostics = diagnose('json', text)
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0]?.line).toBe(4)
  })
})
