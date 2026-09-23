/**
 * WebSocket の接続先（ADR-0013 §帰結）。
 *
 * `WebsocketProvider` は `${serverUrl}/${roomname}` を素朴に連結するので、
 * `serverUrl` は末尾のスラッシュを持たない `wss://<host>/ws` でなければならない。
 */
export const toWebSocketOrigin = (origin: string): string => {
  const url = new URL(origin)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  url.pathname = '/ws'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
