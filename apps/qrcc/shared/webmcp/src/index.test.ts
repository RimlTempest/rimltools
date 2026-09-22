import { describe, expect, test } from 'bun:test'
import type { ModelContext, WebMcpTool } from './index.ts'
import { registerTools } from './index.ts'

const tool = (name: string): WebMcpTool => ({
  name,
  description: `${name} の説明`,
  inputSchema: { type: 'object', properties: {} },
  execute: () => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
})

describe('registerTools', () => {
  test('WebMCP 非対応環境（modelContext が undefined）では何もせず成功を返す', async () => {
    const result = await registerTools(undefined, [tool('a')])
    expect(result.ok).toBe(true)
  })

  test('渡したツールの数だけ registerTool が呼ばれる', async () => {
    const calls: string[] = []
    const context: ModelContext = {
      registerTool: (t) => {
        calls.push(t.name)
        return Promise.resolve(undefined)
      },
    }
    await registerTools(context, [tool('a'), tool('b'), tool('c')])
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  test('registerTool が reject しても例外を投げず失敗を値で返す', async () => {
    const context: ModelContext = {
      registerTool: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    }
    const result = await registerTools(context, [tool('a')])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('register_failed')
      expect(result.error.detail).toContain('NotAllowedError')
    }
  })

  test('返された解除関数を呼ぶと AbortController が abort される', async () => {
    let signal: AbortSignal | undefined
    const context: ModelContext = {
      registerTool: (_t, options) => {
        signal = options.signal
        return Promise.resolve(undefined)
      },
    }
    const result = await registerTools(context, [tool('a')])
    expect(result.ok).toBe(true)
    expect(signal?.aborted).toBe(false)
    if (result.ok) result.value()
    expect(signal?.aborted).toBe(true)
  })

  test('exposedTo を一切渡さない', async () => {
    const seenOptionKeys: string[] = []
    const context: ModelContext = {
      registerTool: (_t, options) => {
        seenOptionKeys.push(...Object.keys(options))
        return Promise.resolve(undefined)
      },
    }
    await registerTools(context, [tool('a')])
    expect(seenOptionKeys).toContain('signal')
    expect(seenOptionKeys).not.toContain('exposedTo')
  })
})
