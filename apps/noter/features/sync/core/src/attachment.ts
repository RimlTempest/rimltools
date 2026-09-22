/**
 * ソケットに紐づく情報（`ws.serializeAttachment`）。
 *
 * DO は hibernation でメモリを失うので、身元と最後の awareness は
 * **ソケット側**に載せる（ADR-0003）。読み戻す値は `unknown` なので、
 * `as` を使わずに型ガードとパーサで検証する。
 */
import type { Result } from '@noter/contract'
import { err, ok, parseRole, parseUserId } from '@noter/contract'
import type { RoomIdentity } from '@noter/sync/contract'
import type { RoomSocket } from './ports.ts'

export type Attachment = {
  readonly identity: RoomIdentity
  /** 最後に受け取った awareness update。まだ来ていなければ null。 */
  readonly awareness: Uint8Array | null
}

export type AttachmentError = { readonly kind: 'invalid_attachment' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readIdentity = (value: unknown): RoomIdentity | null => {
  if (!isRecord(value)) return null
  const role = value['role']
  const actorId = value['actorId']
  const name = value['name']
  if (typeof role !== 'string' || typeof actorId !== 'string' || typeof name !== 'string') {
    return null
  }
  const parsedRole = parseRole(role)
  const parsedActor = parseUserId(actorId)
  if (!parsedRole.ok || !parsedActor.ok) return null
  return { role: parsedRole.value, actorId: parsedActor.value, name }
}

export const readAttachment = (socket: RoomSocket): Result<Attachment, AttachmentError> => {
  const raw = socket.deserializeAttachment()
  if (!isRecord(raw)) return err({ kind: 'invalid_attachment' })

  const identity = readIdentity(raw['identity'])
  if (identity === null) return err({ kind: 'invalid_attachment' })

  const awareness = raw['awareness']
  if (awareness instanceof Uint8Array) return ok({ identity, awareness })
  if (awareness === null || awareness === undefined) return ok({ identity, awareness: null })
  return err({ kind: 'invalid_attachment' })
}

export const writeAttachment = (socket: RoomSocket, attachment: Attachment): void => {
  socket.serializeAttachment({
    identity: attachment.identity,
    awareness: attachment.awareness,
  })
}
