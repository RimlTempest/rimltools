/**
 * qrcc-web → qrcc-api の RPC 封筒（docs/api-contract.md）。
 *
 * ワイヤ上の形は `Result` と 1:1 に対応する。
 *   成功: { "ok": true,  "value": … }
 *   失敗: { "ok": false, "error": { "kind": "…", … } }
 *
 * トランスポートの失敗（封筒が壊れている・中身が読めない）と、
 * 業務上の失敗（権限がない・見つからない）を**混同しない**のが要点。
 * 前者は `Result` の外側、後者は内側で表す。
 */
import type { Result } from './result.ts'
import { err, ok } from './result.ts'

export type RpcDecodeError = {
  readonly kind: 'malformed_envelope' | 'malformed_value' | 'malformed_error'
  readonly detail: string
}

/** 共通の業務エラー。feature 固有のエラーは各 feature の contract で定義する。 */
export type CommonRpcError =
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found'; readonly resource: string }
  | {
      readonly kind: 'limit_exceeded'
      readonly limit: string
      readonly max: number
      readonly actual: number
    }
  | { readonly kind: 'internal' }

export const RPC_HEADER = {
  /** qrcc-web が検証済みの UserId。匿名なら送らない。 */
  actor: 'X-Qrcc-Actor',
  /** ログ相関用。 */
  requestId: 'X-Qrcc-Request-Id',
  /** 作成系メソッドの二重実行を防ぐ。 */
  idempotencyKey: 'Idempotency-Key',
} as const

type Decoder<T> = (value: unknown) => Result<T, { readonly detail: string }>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const malformed = (kind: RpcDecodeError['kind'], detail: string): RpcDecodeError => ({
  kind,
  detail,
})

const readString = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

const readNumber = (source: Record<string, unknown>, key: string): number | undefined => {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 共通エラーを読む。未知の `kind` は握りつぶさず転送エラーにする。 */
export const decodeCommonRpcError = (value: unknown): Result<CommonRpcError, RpcDecodeError> => {
  if (!isRecord(value)) {
    return err(malformed('malformed_error', 'error must be an object'))
  }
  const kind = readString(value, 'kind')
  if (kind === undefined) {
    return err(malformed('malformed_error', 'error requires a string "kind"'))
  }
  switch (kind) {
    case 'unauthorized':
    case 'forbidden':
    case 'internal':
      return ok({ kind })
    case 'not_found': {
      const resource = readString(value, 'resource')
      return resource === undefined
        ? err(malformed('malformed_error', 'not_found requires a string "resource"'))
        : ok({ kind, resource })
    }
    case 'limit_exceeded': {
      const limit = readString(value, 'limit')
      const max = readNumber(value, 'max')
      const actual = readNumber(value, 'actual')
      return limit === undefined || max === undefined || actual === undefined
        ? err(malformed('malformed_error', 'limit_exceeded requires "limit", "max" and "actual"'))
        : ok({ kind, limit, max, actual })
    }
    default:
      return err(malformed('malformed_error', `unknown error kind: ${kind}`))
  }
}

/**
 * 封筒を読む。
 *
 * 戻り値の外側はトランスポートの成否、内側は業務上の成否。
 * `Result<Result<T, E>, RpcDecodeError>` という入れ子は意図的で、
 * 「サーバに届いて意味のある返事が来た」ことと「その返事が成功だった」ことを
 * 呼び出し側に区別させる。
 */
export const decodeRpcEnvelope = <T, E>(
  body: unknown,
  decodeValue: Decoder<T>,
  decodeError: Decoder<E>,
): Result<Result<T, E>, RpcDecodeError> => {
  if (!isRecord(body) || typeof body['ok'] !== 'boolean') {
    return err(malformed('malformed_envelope', 'expected { ok: boolean, value | error }'))
  }
  if (body['ok']) {
    if (!('value' in body)) {
      return err(malformed('malformed_envelope', 'a successful envelope must carry "value"'))
    }
    const decoded = decodeValue(body['value'])
    return decoded.ok
      ? ok(ok(decoded.value))
      : err(malformed('malformed_value', decoded.error.detail))
  }
  if (!('error' in body)) {
    return err(malformed('malformed_envelope', 'a failed envelope must carry "error"'))
  }
  const decoded = decodeError(body['error'])
  return decoded.ok
    ? ok(err(decoded.value))
    : err(malformed('malformed_error', decoded.error.detail))
}
