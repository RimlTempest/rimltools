import { describe, expect, test } from 'bun:test'
import { ok, parsePhoneNumber } from '@qrcc/contract'
import { PAYLOAD_KINDS } from '../contract/index.ts'
import type { RenderFn } from './generate-screen.tsx'
import { makeGenerateTool } from './webmcp-tools.ts'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const OK_RESPONSE = {
  body: '<svg></svg>',
  content_type: 'image/svg+xml',
  width: 240,
  height: 240,
  description: 'QR コード: https://example.com',
  warnings: [],
}

const stubRenderer = (): { render: RenderFn; calls: number } => {
  let calls = 0
  const render: RenderFn = (_request) => {
    calls += 1
    return Promise.resolve(ok(OK_RESPONSE))
  }
  return { render, calls: 0 }
}

const failingRenderer: RenderFn = () =>
  Promise.resolve({
    ok: false,
    error: { kind: 'payload_too_long', symbology: 'ean13', max: 12, actual: 20 },
  })

describe('makeGenerateTool', () => {
  test('name が generate-code、description が用途を説明している', () => {
    const tool = makeGenerateTool(() => Promise.resolve(ok(OK_RESPONSE)))
    expect(tool.name).toBe('generate-code')
    expect(tool.description.length).toBeGreaterThan(0)
  })

  test('inputSchema は type: object で、kind は PAYLOAD_KINDS 由来の enum を持つ', () => {
    const tool = makeGenerateTool(() => Promise.resolve(ok(OK_RESPONSE)))
    expect(tool.inputSchema['type']).toBe('object')
    const properties = tool.inputSchema['properties']
    if (!isRecord(properties)) throw new Error('properties がオブジェクトではない')
    const kindSchema = properties['kind']
    if (!isRecord(kindSchema)) throw new Error('kind の schema がオブジェクトではない')
    expect(kindSchema['enum']).toEqual(PAYLOAD_KINDS)
  })

  test('render を 1 回呼び、URL は payload.kind = url になる', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)
    await tool.execute({ text: 'https://example.com' })
    expect(calls).toHaveLength(1)
    const request = calls[0]
    if (typeof request === 'object' && request !== null && 'payload' in request) {
      expect(request.payload).toEqual({ kind: 'url', url: 'https://example.com' })
    } else {
      throw new Error('request が RenderRequest ではない')
    }
  })

  test('symbology を省略すると qr になる', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)
    await tool.execute({ text: 'https://example.com' })
    const request = calls[0]
    if (typeof request === 'object' && request !== null && 'symbology' in request) {
      const symbology = request.symbology
      if (typeof symbology === 'object' && symbology !== null && 'kind' in symbology) {
        expect(symbology.kind).toBe('qr')
        return
      }
    }
    throw new Error('symbology が読めない')
  })

  test('URL として不正な text は payload.kind が text にフォールバックする', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)
    await tool.execute({ text: 'これはURLではない' })
    const request = calls[0]
    if (typeof request === 'object' && request !== null && 'payload' in request) {
      expect(request.payload).toEqual({ kind: 'text', text: 'これはURLではない' })
      return
    }
    throw new Error('request が RenderRequest ではない')
  })

  test('render が失敗を返したとき、例外を投げず describeRenderError の文言を返す', async () => {
    const tool = makeGenerateTool(failingRenderer)
    const result = await tool.execute({ text: '12345678901234567890', symbology: 'ean13' })
    expect(result.content[0]?.text).toContain('長すぎます')
  })

  test('本文に description と大きさが含まれる', async () => {
    const { render } = stubRenderer()
    const tool = makeGenerateTool(render)
    const result = await tool.execute({ text: 'https://example.com' })
    const text = result.content[0]?.text ?? ''
    expect(text).toContain(OK_RESPONSE.description)
    expect(text).toContain('240')
  })

  test('includeSvg: true のときだけ SVG 本文を含める', async () => {
    const { render } = stubRenderer()
    const tool = makeGenerateTool(render)

    const withoutSvg = await tool.execute({ text: 'https://example.com' })
    expect(withoutSvg.content[0]?.text ?? '').not.toContain('<svg')

    const withSvg = await tool.execute({ text: 'https://example.com', includeSvg: true })
    expect(withSvg.content[0]?.text ?? '').toContain('<svg')
  })

  test('symbology と内容が相性を持たない組み合わせは、render を呼ばず理由を返す', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)
    // ean13 は text しか受け付けないが、URL を渡す
    const result = await tool.execute({ text: 'https://example.com', symbology: 'ean13' })
    expect(calls).toHaveLength(0)
    expect(result.content[0]?.text.length).toBeGreaterThan(0)
  })

  test('kind を省略すると、従来どおり URL / text を自動判別する（回帰）', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)

    await tool.execute({ text: 'https://example.com' })
    await tool.execute({ text: 'これはURLではない' })

    expect(calls).toHaveLength(2)
    const [urlRequest, textRequest] = calls
    if (
      typeof urlRequest === 'object'
      && urlRequest !== null
      && 'payload' in urlRequest
      && typeof textRequest === 'object'
      && textRequest !== null
      && 'payload' in textRequest
    ) {
      expect(urlRequest.payload).toEqual({ kind: 'url', url: 'https://example.com' })
      expect(textRequest.payload).toEqual({ kind: 'text', text: 'これはURLではない' })
      return
    }
    throw new Error('request が RenderRequest ではない')
  })

  describe('kind: tel', () => {
    test('tel.number から電話番号の payload を組み立てる', async () => {
      const calls: unknown[] = []
      const render: RenderFn = (request) => {
        calls.push(request)
        return Promise.resolve(ok(OK_RESPONSE))
      }
      const tool = makeGenerateTool(render)
      await tool.execute({ kind: 'tel', tel: { number: '+819012345678' } })

      expect(calls).toHaveLength(1)
      const request = calls[0]
      const expected = parsePhoneNumber('+819012345678')
      expect(expected.ok).toBe(true)
      if (typeof request === 'object' && request !== null && 'payload' in request && expected.ok) {
        expect(request.payload).toEqual({ kind: 'tel', number: expected.value })
        return
      }
      throw new Error('request が RenderRequest ではない')
    })

    test('不正な電話番号は render を呼ばず、日本語の理由を返す', async () => {
      const calls: unknown[] = []
      const render: RenderFn = (request) => {
        calls.push(request)
        return Promise.resolve(ok(OK_RESPONSE))
      }
      const tool = makeGenerateTool(render)
      const result = await tool.execute({ kind: 'tel', tel: { number: '090-1234-5678' } })

      expect(calls).toHaveLength(0)
      expect(result.content[0]?.text.length).toBeGreaterThan(0)
    })
  })

  describe('kind: email', () => {
    test('email.to / subject / body からメールの payload を組み立てる', async () => {
      const calls: unknown[] = []
      const render: RenderFn = (request) => {
        calls.push(request)
        return Promise.resolve(ok(OK_RESPONSE))
      }
      const tool = makeGenerateTool(render)
      await tool.execute({
        kind: 'email',
        email: { to: 'yamada@example.com', subject: '件名', body: '本文' },
      })

      expect(calls).toHaveLength(1)
      const request = calls[0]
      if (typeof request === 'object' && request !== null && 'payload' in request) {
        expect(request.payload).toEqual({
          kind: 'email',
          to: 'yamada@example.com',
          subject: '件名',
          body: '本文',
        })
        return
      }
      throw new Error('request が RenderRequest ではない')
    })

    test('不正なメールアドレスは render を呼ばず、日本語の理由を返す', async () => {
      const calls: unknown[] = []
      const render: RenderFn = (request) => {
        calls.push(request)
        return Promise.resolve(ok(OK_RESPONSE))
      }
      const tool = makeGenerateTool(render)
      const result = await tool.execute({
        kind: 'email',
        email: { to: 'not-an-email', subject: '', body: '' },
      })

      expect(calls).toHaveLength(0)
      expect(result.content[0]?.text.length).toBeGreaterThan(0)
    })
  })

  test('知らない kind を渡しても例外を投げず、理由を返す', async () => {
    const calls: unknown[] = []
    const render: RenderFn = (request) => {
      calls.push(request)
      return Promise.resolve(ok(OK_RESPONSE))
    }
    const tool = makeGenerateTool(render)
    const result = await tool.execute({ kind: 'not-a-real-kind', text: 'hello' })

    expect(calls).toHaveLength(0)
    expect(result.content[0]?.text.length).toBeGreaterThan(0)
  })
})
