import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { parseActorWire } from '@noter/auth/contract'
import { parseDocumentSummaryWire, parseList } from '@noter/documents/contract'
import { HomeScreen } from '@noter/documents/ui'
import type { DocumentLinkRenderer } from '@noter/documents/ui'
import { homeActions, homeStateFn } from '@noter/documents/ui/wiring'

/** ルータへの依存はルートファイルに閉じ込める（画面はルータなしでテストできる）。 */
const routerDocumentLink: DocumentLinkRenderer = ({ documentId, title }) => (
  <Link to="/d/$documentId" params={{ documentId }}>
    {title}
  </Link>
)

const Home = () => {
  const state = Route.useLoaderData()
  const router = useRouter()

  return (
    <HomeScreen
      actor={parseActorWire(state.actor)}
      documents={parseList(state.documents, parseDocumentSummaryWire)}
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
