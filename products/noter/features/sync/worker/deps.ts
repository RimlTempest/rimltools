/**
 * Durable Object の `ctx` / `env` から core の `RoomDeps` を組み立てる。
 *
 * `document-room.ts` を「1〜3 行の委譲」に保つため、配線はここに置く（ADR-0004）。
 */
import type { RoomDeps } from '../core/src/ports.ts'
import { makeRoomSockets } from './sockets.ts'
import { makeRoomStorage } from './storage.ts'
import { makeTouch } from './touch.ts'

export const makeRoomDeps = (ctx: DurableObjectState, env: CloudflareEnv): RoomDeps => ({
  storage: makeRoomStorage(ctx.storage),
  sockets: makeRoomSockets(ctx),
  now: () => Date.now(),
  touch: makeTouch(env.DB, ctx.id.name),
})
