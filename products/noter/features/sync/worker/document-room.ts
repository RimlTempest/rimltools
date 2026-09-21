import type { Room } from '@noter/sync/core'
import { makeRoom } from '@noter/sync/core'
import { DurableObject } from 'cloudflare:workers'
import { makeRoomDeps } from './deps.ts'

/**
 * 1 文書 = 1 Room の Durable Object。
 *
 * **このリポジトリで `class` を書いてよい唯一のファイル**（ADR-0004）。
 * Durable Object は `class` でしか宣言できないため、ここは薄い殻に留め、
 * ロジックは `features/sync/core` の `makeRoom(deps)` が持つ。
 * **ここに条件分岐や状態を足さないこと。**
 */
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  readonly #room: Room

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env)
    this.#room = makeRoom(makeRoomDeps(ctx, env))
    // wake のたびに SQLite から復元する。復元前のイベント配送を止める（ADR-0005）
    void ctx.blockConcurrencyWhile(() => this.#room.init())
  }

  override fetch = (request: Request): Promise<Response> => this.#room.handleRequest(request)

  override webSocketMessage = (ws: WebSocket, message: ArrayBuffer | string): Promise<void> =>
    this.#room.onMessage(ws, message)

  override webSocketClose = (ws: WebSocket, code: number): Promise<void> =>
    this.#room.onClose(ws, code)

  override webSocketError = (ws: WebSocket): Promise<void> => this.#room.onClose(ws, 1011)

  override alarm = (): Promise<void> => this.#room.onAlarm()
}
