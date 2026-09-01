import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { parseCodeId } from '@qrcc/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import { decodeRenderError, decodeRenderResponse } from '@qrcc/generate/contract'
import type { RenderFn } from '@qrcc/generate/ui'
import type { CodeLinkRenderer } from '@qrcc/manage/ui'
import { CodeEditorScreen } from '@qrcc/manage/ui'
import { canUseBrowserWasm, loadBrowserWasm, makeWasmRenderer } from '@qrcc/wasm'
import { browserManageDeps, manageContextFn } from './manage-wiring.route.ts'

const routerLink: CodeLinkRenderer = ({ to, label }) => <Link to={to}>{label}</Link>

/**
 * プレビューの生成器。設定を触るたびに呼ばれるので、**端末の中だけで**動かす。
 *
 * 生成画面と違ってサーバへの肩代わりを用意しない。編集のたびに qrcc-api を
 * 呼ぶと Workers のリクエスト無料枠を使い切るうえ、プレビューが出なくても
 * 保存・共有という画面の本来の仕事は続けられるため（docs/free-tier-budget.md）。
 */
const browserRenderer = makeWasmRenderer(loadBrowserWasm)

const renderPreview: RenderFn = async (request) => {
  if (!canUseBrowserWasm()) {
    return { ok: false, error: { kind: 'unavailable', detail: 'この環境では wasm を使えません' } }
  }
  const outcome = await browserRenderer.render(request, decodeRenderResponse, decodeRenderError)
  return outcome.ok
    ? outcome.value
    : { ok: false, error: { kind: 'unavailable', detail: outcome.error.kind } }
}

const CodeDetail = () => {
  const context = Route.useLoaderData()
  const { codeId } = Route.useParams()
  const [deps] = useState(() => browserManageDeps(context.origin))
  const parsed = parseCodeId(codeId)

  // URL の値も境界を越える入力。検証してから画面に渡す
  if (!parsed.ok) {
    return (
      <>
        <h1>コードを編集</h1>
        <p>この URL のコードは見つかりませんでした。</p>
        <p>
          <Link to="/codes">保存したコードの一覧に戻る</Link>
        </p>
      </>
    )
  }

  return (
    <CodeEditorScreen
      actor={parseActorWire(context.actor)}
      codeId={parsed.value}
      deps={deps}
      renderPreview={renderPreview}
      renderLink={routerLink}
    />
  )
}

export const Route = createFileRoute('/codes/$codeId')({
  loader: () => manageContextFn(),
  component: CodeDetail,
})
