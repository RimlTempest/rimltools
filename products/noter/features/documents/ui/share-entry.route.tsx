import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { parseShareToken } from '@noter/contract'
import { ShareEntryScreen } from '@noter/documents/ui'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

type JoinResult = { readonly documentId: string | undefined }

/**
 * 共有リンクの入口（docs/design/ux.md §4.3）。
 *
 * セッションが無ければゲストを発行し、`document_member` に upsert してから
 * `/d/:id` へ送る。**ゲストの `Set-Cookie` はこの応答に載せる**ので、
 * リダイレクト先に着いた時点でもうメンバーになっている。
 */
const joinShareFn = createServerFn({ method: 'GET' })
  .validator((token: string) => token)
  .handler(async ({ data }): Promise<JoinResult> => {
    const token = parseShareToken(data)
    if (!token.ok) return { documentId: undefined }

    const request = getRequest()
    const container = makeContainer(env, request)
    const documents = container.documents
    if (documents === undefined) return { documentId: undefined }

    let actor = await container.currentActor(request)
    if (actor.kind === 'visitor') {
      const issued = await container.issueGuest?.()
      if (issued === undefined || !issued.ok) return { documentId: undefined }
      setResponseHeader('set-cookie', [...issued.value.setCookies])
      actor = {
        kind: 'guest',
        userId: issued.value.userId,
        displayName: issued.value.displayName,
        sessionExpiresAt: new Date(),
      }
    }

    const joined = await documents.join(actor, token.value)
    return { documentId: joined.ok ? joined.value : undefined }
  })

export const Route = createFileRoute('/s/$token')({
  beforeLoad: async ({ params }) => {
    const joined = await joinShareFn({ data: params.token })
    if (joined.documentId !== undefined) {
      throw redirect({ to: '/d/$documentId', params: { documentId: joined.documentId } })
    }
  },
  component: () => <ShareEntryScreen />,
})
