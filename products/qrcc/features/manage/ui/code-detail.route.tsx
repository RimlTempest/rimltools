import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { parseCodeId } from '@qrcc/contract'
import { parseActorWire } from '@qrcc/auth/contract'
import type { CodeLinkRenderer } from '@qrcc/manage/ui'
import { CodeEditorScreen } from '@qrcc/manage/ui'
import { browserManageDeps, manageContextFn } from './manage-wiring.route.ts'

const routerLink: CodeLinkRenderer = ({ to, label }) => <Link to={to}>{label}</Link>

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
      renderLink={routerLink}
    />
  )
}

export const Route = createFileRoute('/codes/$codeId')({
  loader: () => manageContextFn(),
  component: CodeDetail,
})
