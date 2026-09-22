import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { FILE_EXTENSION, MIME_TYPE, parseDocumentId } from '@noter/contract'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

/**
 * `/d/:id/raw`（docs/realtime-protocol.md §6）。
 *
 * **DO は認可しない**ので、`can(role, 'export_raw')` をここで通してから
 * `/snapshot` を呼ぶ。visitor は 401、非メンバーと削除済みは 404。
 */
export const Route = createFileRoute('/d/$documentId/raw')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const documentId = parseDocumentId(params.documentId)
        if (!documentId.ok) return new Response('not found', { status: 404 })

        const container = makeContainer(env, request)
        const documents = container.documents
        if (documents === undefined) return new Response('not found', { status: 404 })

        const actor = await container.currentActor(request)
        const authorized = await documents.authorizeRaw(actor, documentId.value)
        if (!authorized.ok) {
          return authorized.error.kind === 'sign_in_required'
            ? new Response('unauthorized', { status: 401 })
            : new Response('not found', { status: 404 })
        }

        const snapshot = await container.snapshot(documentId.value)
        if (!snapshot.ok) return new Response('snapshot is unavailable', { status: 503 })

        const document = authorized.value
        const filename = `${document.title}.${FILE_EXTENSION[document.kind]}`
        return new Response(snapshot.value, {
          headers: {
            'content-type': `${MIME_TYPE[document.kind]}; charset=utf-8`,
            // ブラウザで開いたときは表示する。保存は「書き出し」から行う
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
            // 権限が変わったあとに古い本文をキャッシュから見せない
            'cache-control': 'private, no-store',
          },
        })
      },
    },
  },
})
