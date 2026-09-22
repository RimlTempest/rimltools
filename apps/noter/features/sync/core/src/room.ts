/**
 * 1 文書ぶんの Room。`features/sync/worker/document-room.ts`（Durable Object の殻）が
 * 唯一の呼び出し元で、そこから I/O を注入される（ADR-0004）。
 *
 * `Y.Doc` はこのクロージャに 1 つだけ持つ。`doc.on('update')` は使わず、
 * 受信時に明示的に中継する（origin の扱いを単純に保つため）。
 */
import { MAX_MEMBERS } from '@noter/contract'
import type { RejectReason, RoomIdentity } from '@noter/sync/contract'
import { CLOSE_CODES, parseIdentity } from '@noter/sync/contract'
import * as Y from 'yjs'
import { toArrayBuffer } from './bytes.ts'
import type { Attachment } from './attachment.ts'
import { readAttachment, writeAttachment } from './attachment.ts'
import { encodeRemoval, readClientIds } from './awareness-bytes.ts'
import { handleMessage } from './inbound.ts'
import { INTERNAL_ROUTES } from './internal-routes.ts'
import type { RoomDeps, RoomSocket } from './ports.ts'
import { makePersistScheduler } from './scheduler.ts'
import { loadState, migrate, saveState } from './schema.ts'
import { encodeAwarenessMessage, encodeSyncStep1 } from './wire.ts'

export type Room = {
  /** wake のたびに `blockConcurrencyWhile` の中で呼ぶ。 */
  readonly init: () => Promise<void>
  /** `Upgrade` / `POST /kick` / `GET /snapshot` だけを受ける。他は 404。 */
  readonly handleRequest: (request: Request) => Promise<Response>
  readonly onMessage: (socket: RoomSocket, message: ArrayBuffer | string) => Promise<void>
  readonly onClose: (socket: RoomSocket, code: number) => Promise<void>
  readonly onAlarm: () => Promise<void>
}

const TEXT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' } as const

const isUpgrade = (request: Request): boolean =>
  (request.headers.get('Upgrade') ?? '').toLowerCase() === 'websocket'

const sendTo = (socket: RoomSocket, payload: Uint8Array): void => {
  socket.send(toArrayBuffer(payload))
}

const awarenessOf = (socket: RoomSocket): Uint8Array | null => {
  const attachment = readAttachment(socket)
  return attachment.ok ? attachment.value.awareness : null
}

const identityOf = (socket: RoomSocket): RoomIdentity | null => {
  const attachment = readAttachment(socket)
  return attachment.ok ? attachment.value.identity : null
}

const readActorId = async (request: Request): Promise<string | null> => {
  try {
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) return null
    const actorId = Object.getOwnPropertyDescriptor(body, 'actorId')?.value
    return typeof actorId === 'string' ? actorId : null
  } catch {
    return null
  }
}

export const makeRoom = (deps: RoomDeps): Room => {
  const doc = new Y.Doc()

  const persist = async (): Promise<void> => {
    const updatedAt = deps.now()
    saveState(deps.storage, Y.encodeStateAsUpdate(doc), updatedAt)
    await deps.touch(updatedAt)
  }

  const scheduler = makePersistScheduler({ storage: deps.storage, now: deps.now, persist })

  const others = (origin: RoomSocket): readonly RoomSocket[] =>
    deps.sockets.getWebSockets().filter((socket) => socket !== origin)

  const broadcastExcept = (origin: RoomSocket, payload: Uint8Array): void => {
    for (const socket of others(origin)) sendTo(socket, payload)
  }

  /** 受け入れられない接続にも close code で理由を伝える（`docs/realtime-protocol.md` §1）。 */
  const reject = (request: Request, code: number, reason: RejectReason): Response => {
    const accepted = deps.sockets.accept(request, null)
    accepted.socket.close(code, reason)
    return accepted.response
  }

  const upgrade = (request: Request): Response => {
    const identity = parseIdentity(request.headers)
    if (!identity.ok) return reject(request, CLOSE_CODES.badRequest, 'bad_request')
    if (deps.sockets.getWebSockets().length >= MAX_MEMBERS) {
      return reject(request, CLOSE_CODES.limit, 'limit')
    }

    const attachment: Attachment = { identity: identity.value, awareness: null }
    const accepted = deps.sockets.accept(request, {
      identity: attachment.identity,
      awareness: attachment.awareness,
    })

    sendTo(accepted.socket, encodeSyncStep1(doc))
    for (const socket of others(accepted.socket)) {
      const awareness = awarenessOf(socket)
      if (awareness !== null) sendTo(accepted.socket, encodeAwarenessMessage(awareness))
    }
    return accepted.response
  }

  const kick = async (request: Request): Promise<Response> => {
    const actorId = await readActorId(request)
    if (actorId === null) return new Response('bad request', { status: 400 })

    for (const socket of deps.sockets.getWebSockets()) {
      const attachment = readAttachment(socket)
      if (attachment.ok && attachment.value.identity.actorId === actorId) {
        socket.close(CLOSE_CODES.forbidden, 'forbidden')
      }
    }
    return new Response(null, { status: 204 })
  }

  const snapshot = (): Response =>
    new Response(doc.getText('content').toJSON(), { headers: TEXT_HEADERS })

  return {
    init: async () => {
      migrate(deps.storage)
      const state = loadState(deps.storage)
      if (state !== null) Y.applyUpdate(doc, state)
      // ping/pong は runtime が返す。DO を起こさないのでリクエストに数えられない（ADR-0003）
      deps.sockets.setAutoResponse('ping', 'pong')
      await Promise.resolve()
    },

    handleRequest: async (request: Request) => {
      if (isUpgrade(request)) return upgrade(request)
      const { pathname } = new URL(request.url)
      if (request.method === 'POST' && pathname === INTERNAL_ROUTES.kick) return kick(request)
      if (request.method === 'GET' && pathname === INTERNAL_ROUTES.snapshot) return snapshot()
      return new Response('not found', { status: 404 })
    },

    onMessage: async (socket: RoomSocket, message: ArrayBuffer | string) => {
      const identity = identityOf(socket)
      if (identity === null) {
        socket.close(CLOSE_CODES.badRequest, 'bad_request')
        return
      }

      let dirtied = false
      const result = handleMessage({
        doc,
        socket,
        role: identity.role,
        message,
        send: (payload) => sendTo(socket, payload),
        broadcast: (payload) => broadcastExcept(socket, payload),
        storeAwareness: (bytes) => writeAttachment(socket, { identity, awareness: bytes }),
        awarenessOfOthers: () =>
          others(socket)
            .map((other) => awarenessOf(other))
            .filter((awareness): awareness is Uint8Array => awareness !== null),
        markDirty: () => {
          dirtied = true
        },
      })

      if (dirtied) await scheduler.markDirty()
      if (result.kind === 'close') socket.close(result.code, result.reason)
    },

    onClose: async (socket: RoomSocket, _code: number) => {
      const awareness = awarenessOf(socket)
      if (awareness !== null) {
        broadcastExcept(socket, encodeAwarenessMessage(encodeRemoval(readClientIds(awareness))))
      }
      // 最後の 1 本が閉じたら alarm を待たずに書く（ADR-0005）
      if (others(socket).length === 0) await scheduler.flush()
    },

    onAlarm: () => scheduler.onAlarm(),
  }
}
