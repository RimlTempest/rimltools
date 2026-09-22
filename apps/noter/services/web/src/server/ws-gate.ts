/**
 * `/ws/:documentId` の入口（`docs/realtime-protocol.md` §1）。
 *
 * ルータは通さない。TanStack Start のハンドラより手前で `src/server.ts` が
 * 横取りし、認可を済ませてから DO の binding へそのまま渡す。
 * **DO は認可しない**ので、ここが唯一の関門になる（ADR-0002）。
 */
import { parseDocumentId } from '@noter/contract'
import { encodeIdentity } from '@noter/sync/contract'
import { traced } from '@rimltools/telemetry/worker'
import type { WebEnv } from './container.ts'
import { authorizeWs } from './ws-authorize.ts'

type WsGateEnv = WebEnv & {
  readonly DOCUMENT_ROOM: CloudflareEnv['DOCUMENT_ROOM']
}

const isUpgrade = (request: Request): boolean =>
  (request.headers.get('Upgrade') ?? '').toLowerCase() === 'websocket'

export const handleWebSocketUpgrade = async (
  request: Request,
  env: WsGateEnv,
  rawDocumentId: string,
): Promise<Response> => {
  if (!isUpgrade(request)) {
    return new Response('expected a websocket upgrade', { status: 426 })
  }

  const documentId = parseDocumentId(rawDocumentId)
  if (!documentId.ok) return new Response('not found', { status: 404 })

  const identity = await authorizeWs(request, env, documentId.value)
  if (!identity.ok) {
    return identity.error === 'unauthorized'
      ? new Response('unauthorized', { status: 401 })
      : new Response('not found', { status: 404 })
  }

  // DO はヘッダを検証せずに信じる。到達経路が binding だけだから成り立つ（ADR-0002）
  const headers = new Headers(request.headers)
  for (const [key, value] of encodeIdentity(identity.value)) headers.set(key, value)

  // traced() が traceparent を足すので、DO 側のログを同じ trace に紐づけられる
  const room = env.DOCUMENT_ROOM.getByName(documentId.value)
  return traced('noter-sync', (forwarded) => room.fetch(forwarded))(
    new Request(request, { headers }),
  )
}
