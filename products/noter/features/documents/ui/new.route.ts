import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { parseDocumentKind } from '@noter/contract'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

/**
 * 新規作成（`POST /new`）。ホームの種別ボタンが素の `<form>` で叩く。
 *
 * server function ではなく server route にしているのは、**同じ応答で
 * `Set-Cookie` と 302 の両方を返す**必要があるため。visitor が最初の文書を
 * 作るときは、ここでゲストのセッションを発行してから作る
 * （docs/design/ux.md §6.1「ログイン画面を経由しない」）。
 * `<form>` なので JavaScript が落ちていても作成できる。
 */
const seeOther = (location: string, cookies: readonly string[] = []): Response => {
  const headers = new Headers({ location })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  // 303 なら、戻るボタンで POST を再送されない
  return new Response(null, { status: 303, headers })
}

export const Route = createFileRoute('/new')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData()
        const raw = form.get('kind')
        const kind = parseDocumentKind(typeof raw === 'string' ? raw : '')
        if (!kind.ok) return seeOther('/')

        const container = makeContainer(env, request)
        const documents = container.documents
        if (documents === undefined)
          return new Response('storage is not configured', { status: 503 })

        let actor = await container.currentActor(request)
        const cookies: string[] = []
        if (actor.kind === 'visitor') {
          const issued = await container.issueGuest?.()
          if (issued === undefined || !issued.ok) {
            return new Response('could not start a guest session', { status: 503 })
          }
          cookies.push(...issued.value.setCookies)
          actor = {
            kind: 'guest',
            userId: issued.value.userId,
            displayName: issued.value.displayName,
            // 作成の直後にしか使わない。正確な期限はセッション Cookie が持つ
            sessionExpiresAt: new Date(),
          }
        }

        const created = await documents.create(actor, kind.value)
        // 上限や D1 の失敗はホームへ戻す。理由は次の描画で一覧の状態から読める
        if (!created.ok) return seeOther('/', cookies)
        return seeOther(`/d/${created.value.id}`, cookies)
      },
    },
  },
})
