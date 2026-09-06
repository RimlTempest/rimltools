/**
 * noter-web の Worker エントリ（`wrangler.jsonc` の `main`）。
 *
 * `/ws/:documentId` だけをルータより手前で横取りし、それ以外は
 * TanStack Start の既定ハンドラに渡す（`docs/architecture.md` §8）。
 * WebSocket の Upgrade はルータの Response を経由できないので、ここで分ける。
 */
import startHandler from '@tanstack/react-start/server-entry'
import { handleWebSocketUpgrade } from './server/ws-gate.ts'

const WS_PATH = /^\/ws\/([^/]+)$/

// Worker のエントリは default export でしか宣言できない
// oxlint-disable-next-line import/no-default-export
export default {
  fetch: async (request: Request, env: CloudflareEnv): Promise<Response> => {
    const documentId = WS_PATH.exec(new URL(request.url).pathname)?.[1]
    if (documentId !== undefined) return handleWebSocketUpgrade(request, env, documentId)
    return startHandler.fetch(request)
  },
}
