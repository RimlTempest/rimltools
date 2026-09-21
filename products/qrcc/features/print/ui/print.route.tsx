import { createFileRoute } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import type { Result } from '@qrcc/contract'
import { canUseBrowserWasm, loadBrowserWasm, makeWasmRenderer } from '@qrcc/wasm'
import type { RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import { decodeRenderError, decodeRenderResponse } from '@qrcc/generate/contract'
import type { PrintRenderFailure } from './print-screen.tsx'
import { PrintScreen } from './print-screen.tsx'

/**
 * 印刷用のコードはすべてブラウザ側で生成する。
 *
 * 1 回の印刷で数十枚ぶんを生成するので、サーバに投げると
 * Workers のリクエスト無料枠をすぐ使い切る（docs/free-tier-budget.md）。
 * server function を用意していないのは、うっかり経路が生えないようにするため。
 */
const browserRenderer = makeWasmRenderer(loadBrowserWasm)

const renderInBrowser = async (
  request: RenderRequest,
): Promise<Result<RenderResponse, PrintRenderFailure>> => {
  const outcome = await browserRenderer.render(request, decodeRenderResponse, decodeRenderError)
  return outcome.ok
    ? outcome.value
    : { ok: false, error: { kind: 'unavailable', detail: outcome.error.kind } }
}

/** wasm を使えない環境。サーバへは肩代わりさせず、その旨を伝える。 */
const renderUnavailable = async (): Promise<Result<RenderResponse, PrintRenderFailure>> => ({
  ok: false,
  error: { kind: 'unavailable', detail: 'この環境ではブラウザ内の生成器を使えません' },
})

const neverChanges = () => () => {}

const Print = () => {
  // wasm が使えるのはハイドレーション後だけ。SSR の出力と食い違わせない
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const inBrowser = isHydrated && canUseBrowserWasm()

  return <PrintScreen render={inBrowser ? renderInBrowser : renderUnavailable} />
}

export const Route = createFileRoute('/print')({ component: Print })
