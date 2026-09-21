/**
 * `/ws/:documentId` の認可（docs/realtime-protocol.md §1 の 2 と 3）。
 *
 * **DO は認可しない。** 到達経路が binding だけなので、ここが唯一の関門
 * （ADR-0002）。判定は server function と同じ `can(role, action)` 1 枚を通る
 * （`DocumentService.authorizeRead`）ので、画面と WebSocket で許可がずれない。
 *
 * セッションの読み取りは Cookie ヘッダを見るだけで、本体（body）は消費しない。
 * だから `ws-gate.ts` はこのあとで同じリクエストを DO へ転送できる。
 */
import { actorDisplayName, actorUserId } from '@noter/auth/contract'
import type { DocumentId, Result } from '@noter/contract'
import { err, ok } from '@noter/contract'
import type { RoomIdentity } from '@noter/sync/contract'
import type { WebEnv } from './container.ts'
import { makeContainer } from './container.ts'

export type WsAuthorizeError = 'unauthorized' | 'not_found'

/** 表示名が空のセッションでも presence ラベルを出せるようにする。 */
const NAME_FALLBACK = 'ゲスト'

export const authorizeWs = async (
  request: Request,
  env: WebEnv,
  documentId: DocumentId,
): Promise<Result<RoomIdentity, WsAuthorizeError>> => {
  const container = makeContainer(env, request)
  const documents = container.documents
  // D1 が無い環境では誰もメンバーになれない。存在も知らせない
  if (documents === undefined) return err('not_found')

  const actor = await container.currentActor(request)
  const actorId = actorUserId(actor)
  if (actorId === undefined) return err('unauthorized')

  const access = await documents.authorizeRead(actor, documentId)
  if (!access.ok) {
    return err(access.error.kind === 'sign_in_required' ? 'unauthorized' : 'not_found')
  }

  const name = actorDisplayName(actor) ?? ''
  return ok({
    role: access.value.role,
    actorId,
    name: name === '' ? NAME_FALLBACK : name,
  })
}
