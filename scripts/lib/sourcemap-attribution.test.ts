import { describe, expect, test } from 'bun:test'

import { attributeBytes, decodeVlq, packageOf } from './sourcemap-attribution.ts'

describe('decodeVlq', () => {
  test('decodes base64 VLQ segments', () => {
    expect(decodeVlq('AAAA')).toEqual([0, 0, 0, 0])
    expect(decodeVlq('CAAC')).toEqual([1, 0, 0, 1])
    expect(decodeVlq('D')).toEqual([-1])
    expect(decodeVlq('gB')).toEqual([16])
  })
})

describe('packageOf', () => {
  test('names scoped and unscoped packages under node_modules', () => {
    expect(packageOf('../../node_modules/mermaid/dist/mermaid.core.mjs')).toBe('mermaid')
    expect(packageOf('../../../node_modules/@codemirror/view/dist/index.js')).toBe(
      '@codemirror/view',
    )
    expect(packageOf('/x/node_modules/.bun/katex@0.16.0/node_modules/katex/dist/katex.mjs')).toBe(
      'katex',
    )
  })

  test('groups local sources by their top two directories', () => {
    expect(packageOf('../../features/editor/ui/code-editor.tsx')).toBe('(app) features/editor')
    expect(packageOf('../../../../packages/ui/src/button.tsx')).toBe('(app) packages/ui')
  })
})

describe('attributeBytes', () => {
  test('gives each generated segment to its source until the next segment', () => {
    // 1 行目: 0 列目から source 0、5 列目から source 1。2 行目: 0 列目から source 0。
    const code = 'aaaaabbb\ncc'
    const map = { sources: ['a.js', 'b.js'], mappings: 'AAAA,KCAA;ADAA' }
    const bytes = attributeBytes(code, map)
    expect(bytes.get('a.js')).toBe(5 + 2)
    expect(bytes.get('b.js')).toBe(3)
  })

  test('counts unmapped bytes separately', () => {
    const bytes = attributeBytes('xxaaa', { sources: ['a.js'], mappings: 'EAAA' })
    expect(bytes.get('(unmapped)')).toBe(2)
    expect(bytes.get('a.js')).toBe(3)
  })
})
