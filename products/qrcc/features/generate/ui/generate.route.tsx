import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
// `cloudflare:workers` は Workers ランタイムの組み込みモジュール。
// 動的 import では workerd が解決できないので静的に読む
// （クライアント側ビルドでは vite.config.ts が外部化している）。
import { env } from 'cloudflare:workers'
import type { Result } from '@qrcc/contract'
import { useSyncExternalStore } from 'react'
import { canUseBrowserWasm, loadBrowserWasm, makeWasmRenderer } from '@qrcc/wasm'
import type { RenderRequest, RenderResponse } from '../contract/index.ts'
import { decodeRenderError, decodeRenderResponse } from '../contract/index.ts'
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

/**
 * ブラウザ側の生成器。設定を触るたびに呼ばれるので、Workers の
 * リクエスト無料枠を消費しないことが重要（ADR-0003 / free-tier-budget.md）。
 */
const browserRenderer = makeWasmRenderer(loadBrowserWasm)

const renderInBrowser = async (
  request: RenderRequest,
): Promise<Result<RenderResponse, RenderFailure>> => {
  const outcome = await browserRenderer.render(request, decodeRenderResponse, decodeRenderError)
  // wasm が読めない・落ちている場合はサーバに肩代わりさせる
  return outcome.ok ? outcome.value : renderOnServer({ data: request })
}

const neverChanges = () => () => {}

const Generate = () => {
  // wasm が使えるのはハイドレーション後だけ。SSR の出力と食い違わせない
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const inBrowser = isHydrated && canUseBrowserWasm()

  return (
    <GenerateScreen
      render={inBrowser ? renderInBrowser : (request) => renderOnServer({ data: request })}
      mode={inBrowser ? 'live' : 'manual'}
    />
  )
}

export const Route = createFileRoute('/generate')({ component: Generate })
