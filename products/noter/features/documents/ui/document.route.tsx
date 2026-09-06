import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { parseActorWire } from '@noter/auth/contract'
import {
  parseDocumentWire,
  parseList,
  parseMemberSummaryWire,
  parseRoleOrViewer,
  parseShareLinkWire,
} from '@noter/documents/contract'
import { DocumentScreen } from '@noter/documents/ui'
import type { NavLinkRenderer } from '@noter/shell/ui'
import { documentActions, documentStateFn, shareActions } from '@noter/documents/ui/wiring'

const routerLink: NavLinkRenderer = ({ to, label, isCurrent }) => (
  <Link to={to} {...(isCurrent ? { 'aria-current': 'page' } : {})}>
    {label}
  </Link>
)

/**
 * `/d/:id`（暫定）。plan 005 が `features/editor` の本物に置き換える。
 *
 * 非メンバー・削除済み・visitor はすべて `notFound()`。存在の有無を
 * 区別させない（`DocumentId` は URL に出るため）。
 */
const DocumentPage = () => {
  const state = Route.useLoaderData()
  const router = useRouter()
  const document = parseDocumentWire(state.document)
  const [deps] = useState(() => ({
    actions: documentActions(state.document.id),
    share: shareActions(state.document.id),
  }))

  if (document === undefined) return <p>この文書を表示できませんでした。</p>

  return (
    <DocumentScreen
      actor={parseActorWire(state.actor)}
      document={document}
      actorRole={parseRoleOrViewer(state.role)}
      members={parseList(state.members, parseMemberSummaryWire)}
      links={parseList(state.links, parseShareLinkWire)}
      origin={state.origin}
      actions={deps.actions}
      shareActions={deps.share}
      renderLink={routerLink}
      onChanged={() => void router.invalidate()}
      onLeft={() => void router.navigate({ to: '/' })}
    />
  )
}

export const Route = createFileRoute('/d/$documentId')({
  loader: async ({ params }) => {
    const state = await documentStateFn({ data: params.documentId })
    if (!state.ok) throw notFound()
    return state.value
  },
  component: DocumentPage,
})
