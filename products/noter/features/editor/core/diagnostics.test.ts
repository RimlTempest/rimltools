import { describe, expect, test } from 'bun:test'
import type { Diagnostic } from '@noter/formats/contract'
import { toEditorDiagnostics } from './diagnostics.ts'

const diagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  severity: 'error',
  line: 3,
  column: 5,
  message: '予期しないトークンがあります。',
  source: 'json',
  ...overrides,
})

describe('toEditorDiagnostics', () => {
  test('行・列をそのまま渡す', () => {
    const [first] = toEditorDiagnostics([diagnostic()])
    expect(first?.line).toBe(3)
    expect(first?.column).toBe(5)
  })

  test('直し方（hint）を本文の後ろに続ける', () => {
    const [first] = toEditorDiagnostics([diagnostic({ hint: '閉じ括弧を足してください。' })])
    expect(first?.message).toBe('予期しないトークンがあります。 閉じ括弧を足してください。')
  })

  test('直し方が無いときは本文だけを出す', () => {
    const [first] = toEditorDiagnostics([diagnostic()])
    expect(first?.message).toBe('予期しないトークンがあります。')
  })

  test('件数と並びを変えない', () => {
    const mapped = toEditorDiagnostics([diagnostic({ line: 1 }), diagnostic({ line: 2 })])
    expect(mapped.map((item) => item.line)).toEqual([1, 2])
  })

  test('指摘が無ければ空のまま', () => {
    expect(toEditorDiagnostics([])).toEqual([])
  })
})
