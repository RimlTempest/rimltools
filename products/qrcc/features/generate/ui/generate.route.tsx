import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
// `cloudflare:workers` は Workers ランタイムの組み込みモジュール。
// 動的 import では workerd が解決できないので静的に読む
// （クライアント側ビルドでは vite.config.ts が外部化している）。
import { env } from 'cloudflare:workers'
import type { Result } from '@qrcc/contract'
import type { RenderRequest, RenderResponse } from '../contract/index.ts'
import { decodeRenderResponse } from '../contract/index.ts'
import type { RenderFailure } from './generate-screen.tsx'
import { GenerateScreen } from './generate-screen.tsx'
// TODO: api-client は全 feature が使う基盤なので shared/ へ移す（PR で相談）。
// いまは route ファイル（アプリ側の配線）からのみ参照している。
import { makeApiClient } from '../../../apps/web/src/server/api-client.ts'

/**
 * 生成をサーバ（qrcc-api）に依頼する。
 *
 * ブラウザ側 wasm が入ったら（feat/wasm-bridge）この経路は保存時だけになり、
 * プレビューは端末内で完結する（docs/free-tier-budget.md）。
 */
const renderOnServer = createServerFn({ method: 'POST' })
  .validator((request: RenderRequest) => request)
  .handler(async ({ data }): Promise<Result<RenderResponse, RenderFailure>> => {
    // service binding が無い・落ちている場合でも 500 を投げない。
    // 呼び出し側が値として扱えないと、画面が黙って壊れる。
    if (env.API === undefined) {
      return { ok: false, error: { kind: 'unavailable', detail: 'API binding is not configured' } }
    }
    const client = makeApiClient({
      fetch: (request) => env.API.fetch(request),
      newRequestId: () => crypto.randomUUID(),
    })
    const outcome = await client.call('render', data, decodeRenderResponse)

    if (!outcome.ok) {
      return { ok: false, error: { kind: 'unavailable', detail: outcome.error.kind } }
    }
    if (outcome.value.ok) return { ok: true, value: outcome.value.value }

    // qrcc-api は feature 固有のエラーもそのまま封筒に載せる。
    const error = outcome.value.error
    return {
      ok: false,
      error:
        error.kind === 'not_found' || error.kind === 'unauthorized'
          ? { kind: 'unavailable', detail: error.kind }
          : { kind: 'invalid_option', field: 'request', reason: error.kind },
    }
  })

const Generate = () => <GenerateScreen render={(request) => renderOnServer({ data: request })} />

export const Route = createFileRoute('/generate')({ component: Generate })
