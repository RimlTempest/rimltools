import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { parseShareTokenInput } from '@noter/documents/contract'
import { ShareEntryScreen } from '@noter/documents/ui'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

type JoinResult = { readonly documentId: string | undefined }

/**
 * 共有リンクの入口（docs/design/ux.md §4.3）。
 *
 * **順番が肝心**: 先にトークンを検証し、使えると分かってからゲストを発行する。
 * 逆にすると、形だけ正しい URL（`/s/shr_` + 24 文字）を叩くだけで誰でも
 * user と session の行を D1 に作れてしまい、無料枠の書き込みを削られる。
 *
 * 検証を通ったら、セッションが無ければゲストを発行し、`document_member` に
 * upsert してから `/d/:id` へ送る。**ゲストの `Set-Cookie` はこの応答に載せる**
 * ので、リダイレクト先に着いた時点でもうメンバーになっている。
 */
const joinShareFn = createServerFn({ method: 'GET' })
  // 形の合わないトークンはハンドラまで届かせない（ゲストも発行しない）。
  // Branded 型は直列化の型を越えられないので、ブランドはハンドラで付け直す
  .validator((token: string) => (parseShareTokenInput(token) === undefined ? undefined : token))
  .handler(async ({ data }): Promise<JoinResult> => {
    const token = parseShareTokenInput(data)
    if (token === undefined) return { documentId: undefined }

    const request = getRequest()
    const container = makeContainer(env, request)
    const documents = container.documents
    if (documents === undefined) return { documentId: undefined }

    // 使えないリンクはここで打ち切る。ゲストは発行しない
    if (!(await documents.resolveShareLink(token)).ok) return { documentId: undefined }

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

    const joined = await documents.join(actor, token)
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
