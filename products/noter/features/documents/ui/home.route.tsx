import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { parseActorWire } from '@noter/auth/contract'
import { parseDocumentSummaryWire, parseList } from '@noter/documents/contract'
import { HomeScreen } from '@noter/documents/ui'
import type { DocumentLinkRenderer } from '@noter/documents/ui'
import { homeActions, homeStateFn } from '@noter/documents/ui/wiring'
import { rememberDocumentList } from '@noter/webmcp'

/** ルータへの依存はルートファイルに閉じ込める（画面はルータなしでテストできる）。 */
const routerDocumentLink: DocumentLinkRenderer = ({ documentId, title }) => (
  <Link to="/d/$documentId" params={{ documentId }}>
    {title}
  </Link>
)

const Home = () => {
  const state = Route.useLoaderData()
  const router = useRouter()
  const documents = useMemo(
    () => parseList(state.documents, parseDocumentSummaryWire),
    [state.documents],
  )

  /**
   * WebMCP の `list-documents` はここで読んだ一覧をそのまま返す（ADR-0012）。
   * ツールから改めて Worker を呼ばないので、無料枠を消費しない。
   */
  useEffect(() => {
    rememberDocumentList(documents.map((one) => ({ id: one.id, title: one.title, kind: one.kind })))
  }, [documents])

  return (
    <HomeScreen
      actor={parseActorWire(state.actor)}
      documents={documents}
      actions={homeActions}
      renderDocumentLink={routerDocumentLink}
      onChanged={() => void router.invalidate()}
    />
  )
}

export const Route = createFileRoute('/')({
  loader: () => homeStateFn(),
  component: Home,
})
