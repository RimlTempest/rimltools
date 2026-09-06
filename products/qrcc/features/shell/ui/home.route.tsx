import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Result } from '@qrcc/contract'
import { err } from '@qrcc/contract'
import type { RenderFailure, RenderFn } from '@qrcc/generate/ui'
import { makeGenerateTool } from '@qrcc/generate/ui'
import { GenerateSection } from '@qrcc/generate/ui/wiring'
import type { RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import { decodeRenderError, decodeRenderResponse } from '@qrcc/generate/contract'
import { makeDecodeTool } from '@qrcc/scan/ui'
import { ScanSection } from '@qrcc/scan/ui/wiring'
import type { DecodeHints, DecodeResponse, ScanFailure } from '@qrcc/scan/contract'
import { decodeScanError, decodeScanResponse } from '@qrcc/scan/contract'
import { loadBrowserDecoder, loadBrowserWasm, makeWasmDecoder, makeWasmRenderer } from '@qrcc/wasm'
import { browserModelContext, registerTools } from '@qrcc/webmcp'
import { HomeScreen } from './home-screen.tsx'
import { routerLink } from './router-link.tsx'

/**
 * ツールに渡す生成器・読み取り機は、ここで**端末内の wasm だけ**から組み立てる。
 *
 * `GenerateSection` / `ScanSection` が内部で持つ経路（wasm が使えないときは
 * サーバに肩代わりさせる）とは別にする。ツールはサーバに一切頼らない設計に
 * したいため（Worker のリクエスト無料枠を消費しない、ADR-0010）。
 *
 * `makeWasmRenderer` / `makeWasmDecoder` はどちらも遅延読み込みなので、
 * ここで作るだけでは wasm を取りに行かない（実際に呼ばれるまで待つ）。
 */
const renderer = makeWasmRenderer(loadBrowserWasm)
const decoder = makeWasmDecoder(loadBrowserDecoder)

const renderInBrowser: RenderFn = async (
  request: RenderRequest,
): Promise<Result<RenderResponse, RenderFailure>> => {
  const outcome = await renderer.render(request, decodeRenderResponse, decodeRenderError)
  return outcome.ok ? outcome.value : err({ kind: 'unavailable', detail: outcome.error.detail })
}

/** 画像 1 枚をじっくり探す設定。カメラの連写とは違い、時間をかけてよい。 */
const decodeHints: DecodeHints = { symbologies: [], multiple: true, try_harder: true }

const decodeBytesInBrowser = async (
  bytes: Uint8Array,
): Promise<Result<DecodeResponse, ScanFailure>> => {
  const outcome = await decoder.decode(bytes, decodeHints, decodeScanResponse, decodeScanError)
  return outcome.ok
    ? outcome.value
    : err({ kind: 'decoder_unavailable', detail: outcome.error.detail })
}

/**
 * トップページの composition root。
 *
 * 生成と読み取りはそれぞれの feature が配線済みの部品として持っていて、
 * ここは「トップに、この順で、h2 で並べる」ことだけを決める。
 *
 * WebMCP（`document.modelContext`）が使える環境では、生成と読み取りを
 * エージェント向けのツールとしても登録する。2026-09 時点では Origin Trial
 * 段階の API で、既定ではどのブラウザでも無効。**API が無ければ何も起きない**
 * （docs/adr/0010-webmcp.md）。
 */
const Home = () => {
  useEffect(() => {
    const context = browserModelContext()
    // アンマウントがツール登録より先に起きたら、登録が終わり次第すぐ解除する
    let unmounted = false
    let cleanup: (() => void) | undefined

    const register = async () => {
      const tools = [makeGenerateTool(renderInBrowser), makeDecodeTool(decodeBytesInBrowser)]
      const result = await registerTools(context, tools)
      if (!result.ok) return
      if (unmounted) {
        result.value()
        return
      }
      cleanup = result.value
    }
    void register()

    return () => {
      unmounted = true
      cleanup?.()
    }
  }, [])

  return (
    <HomeScreen
      renderLink={({ to, label }) => routerLink({ to, label, isCurrent: false })}
      generate={<GenerateSection headingLevel={2} />}
      scan={<ScanSection headingLevel={2} />}
    />
  )
}

export const Route = createFileRoute('/')({ component: Home })
