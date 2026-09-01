/**
 * 管理画面の composition root。
 *
 * サーバ側（server function）とブラウザ側（`ManageDeps`）の両方の配線が
 * ここに集まる。画面はこのファイルを知らず、`ManageDeps` を受け取るだけ。
 *
 * server function を **1 つ**にしてメソッド名を引数で受け取るのは、
 * 12 個の同じ形の関数を並べないため。その代わり「何でも転送できる踏み台」に
 * ならないよう、メソッドは許可制にしてある（`isManageMethod`）。
 * 呼び出し元（`UserId`）は必ずここでセッションから決めるので、
 * 画面から成りすませる余地はない（ADR-0002）。
 *
 * `D1Database` の型は Workers ランタイムが供給するもので、feature 単体の
 * TypeScript プログラムでは解決できない。`*.route.*` はアプリ側の配線として
 * apps/web のプログラムに属するので、ここに置くと素直に型が付く。
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import type { CommonRpcError, Result } from '@qrcc/contract'
import { newCodeId, newFolderId } from '@qrcc/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import { apiActorOptions } from '@qrcc/auth/server'
import { currentActorWire } from '@qrcc/auth/ui/auth-env'
import { makeCreateShareDraft } from '@qrcc/manage/core'
import type {
  JsonValue,
  ManageCall,
  ManageContext,
  ManageTransportError,
} from '@qrcc/manage/server'
import {
  decodeManageEnvelope,
  isManageMethod,
  makeManageApi,
  toJsonValue,
} from '@qrcc/manage/server'
import type { ManageDeps } from './manage-deps.tsx'
import { browserCopyText, browserRandomBytes } from './browser-manage.ts'
// TODO: api-client は全 feature が使う基盤なので shared/ へ移す（PR で相談）。
// いまは route ファイル（アプリ側の配線）からのみ参照している。
import { makeApiClient } from '../../../apps/web/src/server/api-client.ts'

export const manageContextFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ManageContext> => {
    const request = getRequest()
    return {
      actor: await currentActorWire(env, request),
      origin: new URL(request.url).origin,
    }
  },
)

type ManageRpcInput = {
  readonly method: string
  readonly body: unknown
  readonly idempotencyKey?: string
}

type ManageRpcOutput = Result<Result<JsonValue, CommonRpcError>, ManageTransportError>

const refused = (kind: string, detail: string): ManageRpcOutput => ({
  ok: false,
  error: { kind, detail },
})

/**
 * qrcc-api への転送。
 *
 * 戻り値は docs/api-contract.md の封筒と同じ入れ子（外側 = 届いたか、
 * 内側 = 成功したか）なので、そのまま `decodeManageEnvelope` で読める。
 */
export const manageRpcFn = createServerFn({ method: 'POST' })
  .validator((input: ManageRpcInput) => input)
  .handler(async ({ data }): Promise<ManageRpcOutput> => {
    if (!isManageMethod(data.method)) {
      // 許可していないメソッドは qrcc-api に届かせない
      return refused('forbidden_method', data.method)
    }
    if (env.API === undefined) {
      return refused('unavailable', 'API binding is not configured')
    }

    // 呼び出し元は必ずサーバで決める。画面から渡させない（ADR-0002）
    const actor = await currentActorWire(env, getRequest())
    const client = makeApiClient({
      fetch: (request) => env.API.fetch(request),
      newRequestId: () => crypto.randomUUID(),
    })

    return client.call(
      data.method,
      data.body,
      (value) => ({ ok: true, value: toJsonValue(value) }),
      {
        ...apiActorOptions(parseActorWire(actor)),
        ...(data.idempotencyKey === undefined ? {} : { idempotencyKey: data.idempotencyKey }),
      },
    )
  })

const call: ManageCall = async (method, body, options) =>
  decodeManageEnvelope(
    await manageRpcFn({
      data: {
        method,
        body,
        ...(options?.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: options.idempotencyKey }),
      },
    }),
  )

/** ブラウザ側の配線。乱数も時計もクリップボードもここでだけ触る。 */
export const browserManageDeps = (origin: string): ManageDeps => ({
  api: makeManageApi({ call }),
  newCodeId: () => newCodeId(browserRandomBytes),
  newFolderId: () => newFolderId(browserRandomBytes),
  newIdempotencyKey: () => crypto.randomUUID(),
  createShareDraft: makeCreateShareDraft({
    now: () => new Date(),
    randomBytes: browserRandomBytes,
  }),
  origin,
  copyText: browserCopyText,
})
