import { describe, expect, test } from 'bun:test'
import { err, ok } from './result.ts'
import type { Result } from './result.ts'
import { RPC_HEADER, decodeCommonRpcError, decodeRpcEnvelope } from './rpc.ts'

type Payload = { readonly n: number }

const decodeNumberPayload = (
  value: unknown,
): Result<Payload, { kind: 'malformed'; detail: string }> =>
  typeof value === 'object' && value !== null && 'n' in value && typeof value.n === 'number'
    ? ok({ n: value.n })
    : err({ kind: 'malformed', detail: 'expected { n: number }' })

describe('RPC 封筒のデコード', () => {
  test('成功の封筒から値を取り出す', () => {
    const decoded = decodeRpcEnvelope(
      { ok: true, value: { n: 1 } },
      decodeNumberPayload,
      decodeCommonRpcError,
    )
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(ok({ n: 1 }))
  })

  test('失敗の封筒から業務エラーを取り出す', () => {
    const decoded = decodeRpcEnvelope(
      { ok: false, error: { kind: 'not_found', resource: 'code' } },
      decodeNumberPayload,
      decodeCommonRpcError,
    )
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(err({ kind: 'not_found', resource: 'code' }))
  })

  test('封筒の形が違えば転送エラーになる', () => {
    for (const body of [null, undefined, 42, 'x', {}, { ok: 'yes' }, { ok: true }, { ok: false }]) {
      const decoded = decodeRpcEnvelope(body, decodeNumberPayload, decodeCommonRpcError)
      expect(decoded.ok).toBe(false)
      if (!decoded.ok) expect(decoded.error.kind).toBe('malformed_envelope')
    }
  })

  test('中身のデコードに失敗したら転送エラーとして返る（業務エラーと混同しない）', () => {
    const decoded = decodeRpcEnvelope(
      { ok: true, value: { n: 'no' } },
      decodeNumberPayload,
      decodeCommonRpcError,
    )
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) {
      expect(decoded.error.kind).toBe('malformed_value')
      expect(decoded.error.detail).toContain('n: number')
    }
  })
})

describe('共通 RPC エラー', () => {
  test('既知の kind をそのまま読む', () => {
    const decoded = decodeCommonRpcError({ kind: 'unauthorized' })
    expect(decoded).toEqual(ok({ kind: 'unauthorized' }))
  })

  test('limit_exceeded は数値フィールドを保持する', () => {
    const decoded = decodeCommonRpcError({
      kind: 'limit_exceeded',
      limit: 'page_size',
      max: 50,
      actual: 120,
    })
    expect(decoded.ok).toBe(true)
    if (decoded.ok && decoded.value.kind === 'limit_exceeded') {
      expect(decoded.value.actual).toBe(120)
    }
  })

  test('未知の kind は転送エラーにする（黙って握りつぶさない）', () => {
    const decoded = decodeCommonRpcError({ kind: 'wat' })
    expect(decoded.ok).toBe(false)
  })

  test('kind がない・オブジェクトでないものを拒否する', () => {
    for (const bad of [null, 'x', 1, {}, { kind: 1 }]) {
      expect(decodeCommonRpcError(bad).ok).toBe(false)
    }
  })
})

describe('RPC ヘッダ名', () => {
  test('docs/api-contract.md と同じ名前を公開する', () => {
    expect(RPC_HEADER.actor).toBe('X-Qrcc-Actor')
    expect(RPC_HEADER.requestId).toBe('X-Qrcc-Request-Id')
    expect(RPC_HEADER.idempotencyKey).toBe('Idempotency-Key')
  })
})
