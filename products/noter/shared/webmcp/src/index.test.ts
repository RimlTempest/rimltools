import { afterEach, describe, expect, test } from 'bun:test'
import type { ModelContext, WebMcpDeps, WebMcpTool } from './index.ts'
import {
  DOCUMENT_LIST_KEY,
  hasModelContext,
  recallDocumentList,
  registerDocumentTools,
  rememberDocumentList,
} from './index.ts'

/** `document.modelContext` を持つ偽の document。DOM は要らない。 */
const fakeDoc = (registered: WebMcpTool[], signals: AbortSignal[]) => {
  const modelContext: ModelContext = {
    registerTool: (tool, options) => {
      registered.push(tool)
      signals.push(options.signal)
      return Promise.resolve(undefined)
    },
  }
  return { modelContext }
}

const deps = (overrides: Partial<WebMcpDeps> = {}): WebMcpDeps => ({
  readDocument: () => ({ kind: 'markdown', text: '# あ' }),
  diagnose: () => [],
  listDocuments: () => [],
  proposeEdit: () => {},
  ...overrides,
})

const run = async (tools: readonly WebMcpTool[], name: string, input = {}) => {
  const tool = tools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`${name} が登録されていない`)
  return await tool.execute(input)
}

const textOf = (result: { readonly content: readonly { readonly text: string }[] }) =>
  result.content.map((part) => part.text).join('\n')

describe('hasModelContext', () => {
  test('WebMCP 非対応（modelContext が無い）なら false', () => {
    expect(hasModelContext({})).toBe(false)
    expect(hasModelContext(undefined)).toBe(false)
    expect(hasModelContext(null)).toBe(false)
  })

  test('registerTool を持つ modelContext があれば true', () => {
    expect(hasModelContext(fakeDoc([], []))).toBe(true)
  })

  test('modelContext があっても registerTool が関数でなければ false', () => {
    expect(hasModelContext({ modelContext: { registerTool: 'いいえ' } })).toBe(false)
  })
})

describe('registerDocumentTools', () => {
  test('WebMCP 非対応環境では 1 つも登録せず、解除関数を返す（挙動が変わらない）', () => {
    const registered: WebMcpTool[] = []
    const unregister = registerDocumentTools(deps(), {})
    expect(registered).toEqual([])
    expect(typeof unregister).toBe('function')
    // 呼んでも落ちない
    unregister()
  })

  test('4 つのツールを登録する', () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(deps(), fakeDoc(registered, []))
    expect(registered.map((tool) => tool.name).toSorted()).toEqual([
      'diagnose-document',
      'list-documents',
      'propose-edit',
      'read-document',
    ])
  })

  test('exposedTo を一切渡さない', () => {
    const seen: string[] = []
    const doc = {
      modelContext: {
        registerTool: (_tool: WebMcpTool, options: Readonly<Record<string, unknown>>) => {
          seen.push(...Object.keys(options))
          return Promise.resolve(undefined)
        },
      },
    }
    registerDocumentTools(deps(), doc)
    expect(seen).toContain('signal')
    expect(seen).not.toContain('exposedTo')
  })

  test('解除関数を呼ぶと signal が abort される', () => {
    const signals: AbortSignal[] = []
    const unregister = registerDocumentTools(deps(), fakeDoc([], signals))
    expect(signals.every((signal) => !signal.aborted)).toBe(true)
    unregister()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  test('registerTool が reject しても例外にならない', () => {
    const doc = {
      modelContext: {
        registerTool: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    }
    expect(() => registerDocumentTools(deps(), doc)).not.toThrow()
  })

  test('read-document は本文と種別を返す', async () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(
      deps({ readDocument: () => ({ kind: 'yaml', text: 'a: 1' }) }),
      fakeDoc(registered, []),
    )
    const text = textOf(await run(registered, 'read-document'))
    expect(text).toContain('yaml')
    expect(text).toContain('a: 1')
  })

  test('read-document は文書が無いときも落ちない', async () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(deps({ readDocument: () => null }), fakeDoc(registered, []))
    const text = textOf(await run(registered, 'read-document'))
    expect(text).toContain('開いていません')
  })

  test('diagnose-document は指摘を行・列つきで返す', async () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(
      deps({ diagnose: () => [{ line: 3, column: 5, message: '予期しないトークン' }] }),
      fakeDoc(registered, []),
    )
    const text = textOf(await run(registered, 'diagnose-document'))
    expect(text).toContain('3')
    expect(text).toContain('5')
    expect(text).toContain('予期しないトークン')
  })

  test('diagnose-document は指摘が無いことも伝える', async () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(deps({ diagnose: () => [] }), fakeDoc(registered, []))
    expect(textOf(await run(registered, 'diagnose-document'))).toContain('問題はありません')
  })

  test('list-documents は渡された一覧を返す', async () => {
    const registered: WebMcpTool[] = []
    registerDocumentTools(
      deps({
        listDocuments: () => [{ id: 'doc_1', title: '設計メモ', kind: 'markdown' }],
      }),
      fakeDoc(registered, []),
    )
    const text = textOf(await run(registered, 'list-documents'))
    expect(text).toContain('doc_1')
    expect(text).toContain('設計メモ')
  })

  test('propose-edit は deps を呼ぶだけで、文書には触れない', async () => {
    const registered: WebMcpTool[] = []
    const proposed: string[] = []
    registerDocumentTools(
      deps({ proposeEdit: (text) => proposed.push(text) }),
      fakeDoc(registered, []),
    )
    const result = await run(registered, 'propose-edit', { text: '新しい本文' })
    expect(proposed).toEqual(['新しい本文'])
    expect(textOf(result)).toContain('提案')
  })

  test('propose-edit は text が文字列でなければ何も提案しない', async () => {
    const registered: WebMcpTool[] = []
    const proposed: string[] = []
    registerDocumentTools(
      deps({ proposeEdit: (text) => proposed.push(text) }),
      fakeDoc(registered, []),
    )
    const result = await run(registered, 'propose-edit', { text: 42 })
    expect(proposed).toEqual([])
    expect(textOf(result)).toContain('text')
  })
})

describe('rememberDocumentList / recallDocumentList', () => {
  afterEach(() => {
    globalThis.sessionStorage?.clear()
  })

  test('覚えた一覧をそのまま思い出せる', () => {
    rememberDocumentList([{ id: 'doc_1', title: 'あ', kind: 'toml' }])
    expect(recallDocumentList()).toEqual([{ id: 'doc_1', title: 'あ', kind: 'toml' }])
  })

  test('何も覚えていなければ空', () => {
    expect(recallDocumentList()).toEqual([])
  })

  test('壊れた値が入っていても空を返す（例外にしない）', () => {
    globalThis.sessionStorage.setItem(DOCUMENT_LIST_KEY, '{壊れている')
    expect(recallDocumentList()).toEqual([])
  })

  test('知らない種別の行は落とす', () => {
    globalThis.sessionStorage.setItem(
      DOCUMENT_LIST_KEY,
      JSON.stringify([
        { id: 'doc_1', title: 'あ', kind: 'csv' },
        { id: 'doc_2', title: 'い', kind: 'json' },
      ]),
    )
    expect(recallDocumentList()).toEqual([{ id: 'doc_2', title: 'い', kind: 'json' }])
  })
})
