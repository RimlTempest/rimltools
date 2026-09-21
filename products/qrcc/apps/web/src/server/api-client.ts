/**
 * qrcc-api（auxiliary Worker）を service binding 経由で呼ぶクライアント。
 *
 * 追加のリクエスト課金がなく CORS も発生しない（ADR-0002）。
 * ホスト名は binding では無視されるので、ログで判別しやすい固定値を使う。
 *
 * 依存（fetch と ID 生成）は引数で受け取るので、Worker を起動せずテストできる。
 */
import type { CommonRpcError, Result, RpcDecodeError, UserId } from '@qrcc/contract'
import { RPC_HEADER, decodeCommonRpcError, decodeRpcEnvelope, err } from '@qrcc/contract'

const BINDING_ORIGIN = 'https://qrcc-api.internal'

type Fetcher = (request: Request) => Promise<Response>

type ApiClientDeps = {
  /** service binding の fetch。`env.API.fetch` を渡す。 */
  readonly fetch: Fetcher
  readonly newRequestId: () => string
}

export type CallOptions = {
  /** 認証済みの呼び出し元。匿名なら省く。 */
  readonly actor?: UserId
  /** 作成系メソッドの二重実行を防ぐ。 */
  readonly idempotencyKey?: string
}

/** 呼び出しそのものが成立しなかった理由。業務エラーとは別物。 */
export type ApiTransportError =
  | { readonly kind: 'transport'; readonly status: number; readonly detail: string }
  | RpcDecodeError

/** 応答値の検証。境界を越える値は必ずここを通す。 */
export type ValueDecoder<T> = (value: unknown) => Result<T, { readonly detail: string }>

export type ApiClient = {
  /**
   * 外側は「意味のある返事が届いたか」、内側は「その返事が成功か」。
   * この入れ子は docs/api-contract.md の封筒と 1:1 で対応する。
   *
   * `decode` は必須。ネットワーク越しの値を無検証で型付けさせないため。
   */
  readonly call: <T>(
    method: string,
    body: unknown,
    decode: ValueDecoder<T>,
    options?: CallOptions,
  ) => Promise<Result<Result<T, CommonRpcError>, ApiTransportError>>
}

export const makeApiClient = (deps: ApiClientDeps): ApiClient => {
  const call = async <T>(
    method: string,
    body: unknown,
    decode: ValueDecoder<T>,
    options: CallOptions = {},
  ): Promise<Result<Result<T, CommonRpcError>, ApiTransportError>> => {
    const headers = new Headers({
      'content-type': 'application/json',
      [RPC_HEADER.requestId]: deps.newRequestId(),
    })
    if (options.actor !== undefined) headers.set(RPC_HEADER.actor, options.actor)
    if (options.idempotencyKey !== undefined) {
      headers.set(RPC_HEADER.idempotencyKey, options.idempotencyKey)
    }

    let response: Response
    try {
      response = await deps.fetch(
        new Request(`${BINDING_ORIGIN}/rpc/${method}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
      )
    } catch (cause) {
      // 呼び出し側に例外を漏らさない。失敗は値で返す
      return err({ kind: 'transport', status: 0, detail: String(cause) })
    }

    if (!response.ok) {
      return err({
        kind: 'transport',
        status: response.status,
        detail: await response.text().catch(() => ''),
      })
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch (cause) {
      return err({ kind: 'malformed_envelope', detail: String(cause) })
    }

    return decodeRpcEnvelope<T, CommonRpcError>(parsed, decode, decodeCommonRpcError)
  }

  return { call }
}
