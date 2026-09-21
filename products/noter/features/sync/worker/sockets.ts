/**
 * `DurableObjectState` を core の `RoomSockets` に合わせるアダプタ。
 *
 * `WebSocketPair` と 101 レスポンスは Workers ランタイム固有なので、
 * core ではなくここに閉じ込める（ADR-0003 / ADR-0004）。
 */
import type { AcceptedSocket, RoomSockets } from '../core/src/ports.ts'

export const makeRoomSockets = (ctx: DurableObjectState): RoomSockets => ({
  accept: (_request: Request, attachment: unknown): AcceptedSocket => {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    // Hibernation API。標準の `addEventListener` は使わない（ADR-0003）
    ctx.acceptWebSocket(server)
    server.serializeAttachment(attachment)
    return { response: new Response(null, { status: 101, webSocket: client }), socket: server }
  },
  getWebSockets: () => ctx.getWebSockets(),
  setAutoResponse: (ping: string, pong: string) => {
    // ping/pong は runtime が返す。DO を起こさないのでリクエストに数えられない
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(ping, pong))
  },
})
