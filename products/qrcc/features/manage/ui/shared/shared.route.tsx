/**
 * `/shared/<token>` の配線（composition root）。
 *
 * **サインインを要求しない。** `shares.resolve` は公開メソッド
 * （`PUBLIC_MANAGE_METHODS`）で、リンクを知っていること自体が鍵になる。
 * 呼び出し元はいつもどおりサーバ側で決まるので、画面から誰かに成りすます
 * 余地はない（ADR-0002）。
 *
 * 絵はブラウザの wasm で描く。共有リンクは何人にも配られるので、
 * ここをサーバ生成にすると Workers の無料枠を配布数ぶん消費する
 * （docs/free-tier-budget.md）。wasm が動かない環境だけサーバに肩代わりさせる。
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
// `cloudflare:workers` は Workers ランタイムの組み込みモジュール。
// 動的 import では workerd が解決できないので静的に読む。
import { env } from 'cloudflare:workers'
import { useState } from 'react'
import type { Result } from '@qrcc/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import type { RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import { decodeRenderError, decodeRenderResponse } from '@qrcc/generate/contract'
import type { RenderFailure, RenderFn } from '@qrcc/generate/ui'
import { canUseBrowserWasm, loadBrowserWasm, makeWasmRenderer } from '@qrcc/wasm'
import type { CodeLinkRenderer } from '../manage-deps.tsx'
import { browserManageDeps, manageContextFn } from '../manage-wiring.route.ts'
import type { SharedCodeDeps } from './shared-code-screen.tsx'
import { SharedCodeScreen } from './shared-code-screen.tsx'
// TODO: api-client は全 feature が使う基盤なので shared/ へ移す（PR で相談）。
// いまは route ファイル（アプリ側の配線）からのみ参照している。
import { makeApiClient } from '../../../../apps/web/src/server/api-client.ts'

const routerLink: CodeLinkRenderer = ({ to, label }) => <Link to={to}>{label}</Link>

/** wasm が動かない環境のための肩代わり。ここに来るのは例外的な場合だけ。 */
const renderOnServer = createServerFn({ method: 'POST' })
  .validator((request: RenderRequest) => request)
  .handler(async ({ data }): Promise<Result<RenderResponse, RenderFailure>> => {
    if (env.API === undefined) {
      return { ok: false, error: { kind: 'unavailable', detail: 'API binding is not configured' } }
    }
    const client = makeApiClient({
      fetch: (request) => env.API.fetch(request),
      newRequestId: () => crypto.randomUUID(),
    })
    const outcome = await client.call('render', data, decodeRenderResponse)

    if (!outcome.ok)
      return { ok: false, error: { kind: 'unavailable', detail: outcome.error.kind } }
    if (outcome.value.ok) return { ok: true, value: outcome.value.value }
    return { ok: false, error: { kind: 'unavailable', detail: outcome.value.error.kind } }
  })

const browserRenderer = makeWasmRenderer(loadBrowserWasm)

const renderSharedCode: RenderFn = async (request) => {
  if (!canUseBrowserWasm()) return renderOnServer({ data: request })
  const outcome = await browserRenderer.render(request, decodeRenderResponse, decodeRenderError)
  return outcome.ok ? outcome.value : renderOnServer({ data: request })
}

const SharedCode = () => {
  const context = Route.useLoaderData()
  const { token } = Route.useParams()
  // 共有された人は保存も削除もしないので、解決だけを取り出して渡す（ISP）。
  const [deps] = useState<SharedCodeDeps>(() => ({
    resolveShare: browserManageDeps(context.origin).api.resolveShare,
    render: renderSharedCode,
  }))

  return (
    <SharedCodeScreen
      actor={parseActorWire(context.actor)}
      deps={deps}
      renderLink={routerLink}
      token={token}
    />
  )
}

export const Route = createFileRoute('/shared/$token')({
  loader: () => manageContextFn(),
  component: SharedCode,
})
