/**
 * DO の受信処理（`docs/realtime-protocol.md` §3 の擬似コードをそのまま関数にしたもの）。
 *
 * y-protocols の `readSyncMessage` は使わない。あれは step1 / step2 / update を
 * まとめて処理してしまい、**viewer の更新だけを捨てる**判定を挟めないため。
 *
 * 副作用は全て引数のコールバックで受け取る。この関数自身は I/O を持たない。
 */
import type { Role } from '@noter/contract'
import { MAX_WS_MESSAGE_BYTES } from '@noter/contract'
import type { RejectReason } from '@noter/sync/contract'
import {
  CLOSE_CODES,
  MAX_AWARENESS_BYTES,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
} from '@noter/sync/contract'
import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'
import type { RoomSocket } from './ports.ts'
import { encodeAwarenessMessage, encodeSyncStep2, encodeSyncUpdate } from './wire.ts'

export type InboundResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'close'; readonly code: number; readonly reason: RejectReason }

export type InboundDeps = {
  readonly doc: Y.Doc
  /** `Y.applyUpdate` の origin に使う。中継の際に送り主を除くのにも使う。 */
  readonly socket: RoomSocket
  readonly role: Role
  readonly message: ArrayBuffer | string
  /** 送り主へ返す。 */
  readonly send: (payload: Uint8Array) => void
  /** 送り主以外の全員へ配る。 */
  readonly broadcast: (payload: Uint8Array) => void
  /** 送り主の attachment に awareness を記録する。 */
  readonly storeAwareness: (bytes: Uint8Array) => void
  /** 送り主以外が最後に送った awareness。 */
  readonly awarenessOfOthers: () => readonly Uint8Array[]
  readonly markDirty: () => void
}

const ok: InboundResult = { kind: 'ok' }

const close = (code: number, reason: RejectReason): InboundResult => ({
  kind: 'close',
  code,
  reason,
})

const badRequest = close(CLOSE_CODES.badRequest, 'bad_request')

const handleSync = (deps: InboundDeps, decoder: decoding.Decoder): InboundResult => {
  const subtype = decoding.readVarUint(decoder)

  if (subtype === SYNC_STEP1) {
    deps.send(encodeSyncStep2(deps.doc, decoding.readVarUint8Array(decoder)))
    return ok
  }

  if (subtype === SYNC_STEP2 || subtype === SYNC_UPDATE) {
    const update = decoding.readVarUint8Array(decoder)
    // viewer は読み取り専用。返しも切りもせず、黙って捨てる
    if (deps.role === 'viewer') return ok
    Y.applyUpdate(deps.doc, update, deps.socket)
    deps.broadcast(encodeSyncUpdate(update))
    deps.markDirty()
    return ok
  }

  return badRequest
}

const handleAwareness = (deps: InboundDeps, decoder: decoding.Decoder): InboundResult => {
  const update = decoding.readVarUint8Array(decoder)
  if (deps.role === 'viewer') return ok
  // attachment は 16 KB までしか載らない。超えたものは中継もしない
  if (update.byteLength > MAX_AWARENESS_BYTES) return ok
  deps.storeAwareness(update)
  deps.broadcast(encodeAwarenessMessage(update))
  return ok
}

const handleQueryAwareness = (deps: InboundDeps): InboundResult => {
  for (const update of deps.awarenessOfOthers()) deps.send(encodeAwarenessMessage(update))
  return ok
}

export const handleMessage = (deps: InboundDeps): InboundResult => {
  // テキストフレームは受け付けない。`ping` は setWebSocketAutoResponse が処理するので届かない
  if (typeof deps.message === 'string') return badRequest
  if (deps.message.byteLength > MAX_WS_MESSAGE_BYTES) {
    return close(CLOSE_CODES.tooLarge, 'too_large')
  }

  try {
    const decoder = decoding.createDecoder(new Uint8Array(deps.message))
    const type = decoding.readVarUint(decoder)
    switch (type) {
      case MESSAGE_SYNC:
        return handleSync(deps, decoder)
      case MESSAGE_AWARENESS:
        return handleAwareness(deps, decoder)
      case MESSAGE_QUERY_AWARENESS:
        return handleQueryAwareness(deps)
      default:
        // 未知・予約帯（≥100）。追加するときは docs/realtime-protocol.md §8 の手順で
        return badRequest
    }
  } catch {
    // 壊れたバイト列。中継元はクライアントなので、部屋ごと落とさずこの接続だけ閉じる
    return badRequest
  }
}
