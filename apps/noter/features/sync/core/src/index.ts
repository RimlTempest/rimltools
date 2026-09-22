/**
 * @noter/sync/core — I/O を持たない Room のロジック。
 *
 * 依存（DO storage / ソケット / 時計 / D1 の touch）は `RoomDeps` として
 * 引数で受け取る。配線は `features/sync/worker` が行う（ADR-0004）。
 */
export type { Attachment, AttachmentError } from './attachment.ts'
export { readAttachment, writeAttachment } from './attachment.ts'
export type { AwarenessEntry } from './awareness-bytes.ts'
export { encodeRemoval, readClientIds } from './awareness-bytes.ts'
export { toArrayBuffer } from './bytes.ts'
export type { InboundDeps, InboundResult } from './inbound.ts'
export { handleMessage } from './inbound.ts'
export { INTERNAL_ROUTES } from './internal-routes.ts'
export type {
  AcceptedSocket,
  RoomDeps,
  RoomSocket,
  RoomSockets,
  RoomStorage,
  SqlCursor,
  SqlValue,
} from './ports.ts'
export type { Room } from './room.ts'
export { makeRoom } from './room.ts'
export type { PersistScheduler, PersistSchedulerDeps } from './scheduler.ts'
export { makePersistScheduler } from './scheduler.ts'
export { SCHEMA_VERSION, loadState, migrate, saveState } from './schema.ts'
export {
  encodeAwarenessMessage,
  encodeSyncStep1,
  encodeSyncStep2,
  encodeSyncUpdate,
} from './wire.ts'
