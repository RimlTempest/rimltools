/**
 * qrcc-web の Worker エントリ（`wrangler.jsonc` の `main`）。
 *
 * TanStack Start の既定ハンドラを計装（`@rimltools/telemetry`）で包むだけ。
 * OTEL_EXPORTER_OTLP_ENDPOINT / FARO_URL が無ければ何もしない（docs/observability.md）。
 */
import startHandler from '@tanstack/react-start/server-entry'
import { instrument } from '@rimltools/telemetry/worker'

// Worker のエントリは default export でしか宣言できない
// oxlint-disable-next-line import/no-default-export
export default {
  fetch: instrument<CloudflareEnv>(async (request) => startHandler.fetch(request), {
    serviceName: 'qrcc-web',
    browser: {
      app: 'qrcc',
      rewrite: (response, headHtml) =>
        new HTMLRewriter()
          .on('head', {
            element: (head) => {
              head.append(headHtml, { html: true })
            },
          })
          .transform(response),
    },
  }),
}
