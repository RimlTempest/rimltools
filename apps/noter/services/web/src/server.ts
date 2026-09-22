/**
 * noter-web の Worker エントリ（`wrangler.jsonc` の `main`）。
 *
 * `/ws/:documentId` だけをルータより手前で横取りし、それ以外は
 * TanStack Start の既定ハンドラに渡す（`docs/architecture.md` §8）。
 * WebSocket の Upgrade はルータの Response を経由できないので、ここで分ける。
 */
import startHandler from '@tanstack/react-start/server-entry'
import { instrument } from '@rimltools/telemetry/worker'
import { handleWebSocketUpgrade } from './server/ws-gate.ts'

const WS_PATH = /^\/ws\/([^/]+)$/

// Worker のエントリは default export でしか宣言できない
// oxlint-disable-next-line import/no-default-export
export default {
  // 計装（docs/ops/telemetry.md）。OTEL_EXPORTER_OTLP_ENDPOINT / FARO_URL が無ければ素通し
  fetch: instrument<CloudflareEnv>(
    async (request, env) => {
      const documentId = WS_PATH.exec(new URL(request.url).pathname)?.[1]
      if (documentId !== undefined) return handleWebSocketUpgrade(request, env, documentId)
      return startHandler.fetch(request)
    },
    {
      serviceName: 'noter-web',
      // /ws/:documentId は ID ごとに系列が増えないようテンプレートにする
      route: (url) => (WS_PATH.test(url.pathname) ? '/ws/:documentId' : undefined),
      browser: {
        app: 'noter',
        rewrite: (response, headHtml) =>
          new HTMLRewriter()
            .on('head', {
              element: (head) => {
                head.append(headHtml, { html: true })
              },
            })
            .transform(response),
      },
    },
  ),
}
