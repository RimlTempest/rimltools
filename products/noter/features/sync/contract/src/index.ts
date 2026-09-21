/**
 * @noter/sync/contract — 同期プロトコルの型と定数。
 *
 * `docs/realtime-protocol.md` が唯一の定義で、ここはその写し。
 * DO 側（`features/sync/core`）とブラウザ側（`features/sync/client`）が
 * 同じ値を読むことで、両者のテストがずれないようにする。
 */
export type { CloseCode, RejectReason } from './close-codes.ts'
export { CLOSE_CODES, reasonOf } from './close-codes.ts'
export type { ConnectionState } from './connection-state.ts'
export {
  MAX_AWARENESS_BYTES,
  PERSIST_BACKOFF_MAX_MS,
  PERSIST_DELAY_MS,
  TOUCH_THROTTLE_MS,
} from './constants.ts'
export type { IdentityParseError, RoomIdentity } from './headers.ts'
export { HEADER_ACTOR, HEADER_NAME, HEADER_ROLE, encodeIdentity, parseIdentity } from './headers.ts'
export {
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_RESERVED_FLOOR,
  MESSAGE_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
} from './messages.ts'
