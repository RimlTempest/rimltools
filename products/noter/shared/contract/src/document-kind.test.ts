import { describe, expect, test } from 'bun:test'
import { DOCUMENT_KINDS, FILE_EXTENSION, MIME_TYPE, parseDocumentKind } from './document-kind.ts'
import { isErr } from './result.ts'

describe('parseDocumentKind', () => {
  test('4 種の文書種別を受け付ける', () => {
    for (const kind of DOCUMENT_KINDS) {
      const parsed = parseDocumentKind(kind)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toBe(kind)
    }
  })

  test('対応していない種別を拒否する', () => {
    expect(isErr(parseDocumentKind('csv'))).toBe(true)
    expect(isErr(parseDocumentKind(''))).toBe(true)
    expect(isErr(parseDocumentKind('Markdown'))).toBe(true)
  })

  test('エラーは受け付ける種別を持つ', () => {
    const parsed = parseDocumentKind('csv')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('invalid_document_kind')
      expect(parsed.error.expected).toContain('markdown')
      expect(parsed.error.received).toBe('csv')
    }
  })
})

describe('拡張子と MIME 型', () => {
  test('全種別に拡張子がある', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(FILE_EXTENSION[kind].length).toBeGreaterThan(0)
    }
    expect(FILE_EXTENSION.markdown).toBe('md')
    expect(FILE_EXTENSION.yaml).toBe('yaml')
    expect(FILE_EXTENSION.toml).toBe('toml')
    expect(FILE_EXTENSION.json).toBe('json')
  })

  test('全種別に MIME 型がある', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(MIME_TYPE[kind]).toContain('/')
    }
    expect(MIME_TYPE.markdown).toBe('text/markdown')
    expect(MIME_TYPE.yaml).toBe('application/yaml')
    expect(MIME_TYPE.toml).toBe('application/toml')
    expect(MIME_TYPE.json).toBe('application/json')
  })
})
