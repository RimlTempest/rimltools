/**
 * ワイヤ形式の組み立て（y-websocket 互換、ADR-0013）。
 *
 * 受信側の分岐は `inbound.ts` が自前で行う（viewer の更新を捨てるため、
 * y-protocols の `readSyncMessage` は使えない）。ここは送信側だけを持つ。
 */
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
} from '@noter/sync/contract'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

export const encodeSyncStep1 = (doc: Y.Doc): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_STEP1)
  encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc))
  return encoding.toUint8Array(encoder)
}

export const encodeSyncStep2 = (doc: Y.Doc, stateVector: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_STEP2)
  encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(doc, stateVector))
  return encoding.toUint8Array(encoder)
}

export const encodeSyncUpdate = (update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_UPDATE)
  encoding.writeVarUint8Array(encoder, update)
  return encoding.toUint8Array(encoder)
}

export const encodeAwarenessMessage = (update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(encoder, update)
  return encoding.toUint8Array(encoder)
}
